import SwiftUI
import AppKit
import Security
import CoreImage.CIFilterBuiltins
import ServiceManagement

struct HostConfig: Codable {var secret:String;var url:String;var website:String}
struct Device: Identifiable {let id:String;let name:String}
@MainActor final class HostModel:ObservableObject {
    @Published var status="Import host configuration to begin"
    @Published var code="------"
    @Published var website=""
    @Published var approval:(id:String,name:String)?
    @Published var devices:[Device]=[]
    @Published var error=""
    var config:HostConfig?;var socket:URLSessionWebSocketTask?;var peer:DesktopPeer?;var session="";var activePeerID:UUID?;var reconnect:Task<Void,Never>?
    init() {
        if let index=CommandLine.arguments.firstIndex(of:"--config"),CommandLine.arguments.count>index+1 {
            do { let data=try Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[index+1]));let c=try JSONDecoder().decode(HostConfig.self,from:data)
                guard let u=URL(string:c.url),u.scheme=="wss" || (u.scheme=="ws" && ["localhost","127.0.0.1"].contains(u.host ?? "")),c.secret.count>=32 else{throw NSError(domain:"Invalid host configuration",code:1)}
                try saveSecret(data);config=c;connect();return
            }catch{self.error=error.localizedDescription}
        }
        if let d=loadSecret(),let c=try? JSONDecoder().decode(HostConfig.self,from:d){config=c;connect()}
    }
    func importConfig() {
        let panel=NSOpenPanel();panel.canChooseDirectories=false;panel.allowsMultipleSelection=false;panel.message="Choose .data/host.json from your DeskDeck server. This is a private credential; do not share it."
        guard panel.runModal() == .OK,let url=panel.url else{return}
        do {let d=try Data(contentsOf:url);let c=try JSONDecoder().decode(HostConfig.self,from:d)
            guard let u=URL(string:c.url),u.scheme=="wss" || (u.scheme=="ws" && ["localhost","127.0.0.1"].contains(u.host ?? "")),c.secret.count>=32 else{throw NSError(domain:"Invalid configuration",code:1)}
            try saveSecret(d);config=c;socket?.cancel();connect()
        }catch{self.error=error.localizedDescription}
    }
    func connect() {
        guard let c=config,let url=URL(string:c.url) else{return};website=c.website;status="Connecting to your server…";error=""
        var req=URLRequest(url:url);req.setValue("Bearer \(c.secret)",forHTTPHeaderField:"Authorization")
        let ws=URLSession.shared.webSocketTask(with:req);socket=ws;ws.resume();send(["type":"hello","name":Host.current().localizedName ?? "Mac"]);receive(ws)
    }
    func send(_ m:[String:Any]) {guard let d=try? JSONSerialization.data(withJSONObject:m),let s=String(data:d,encoding:.utf8) else{return};socket?.send(.string(s)){_ in}}
    func receive(_ ws:URLSessionWebSocketTask) {
        ws.receive { [weak self] result in Task { @MainActor in
            guard let self=self,self.socket===ws else{return}
            switch result {
            case .failure(let e):self.stopPeer();self.status="Server unavailable";self.error=e.localizedDescription;self.code="------";self.reconnect?.cancel();self.reconnect=Task{try? await Task.sleep(for:.seconds(3));if !Task.isCancelled{self.connect()}}
            case .success(let message):
                let d:Data;switch message{case .data(let value):d=value;case .string(let s):d=Data(s.utf8);@unknown default:return}
                if let m=(try? JSONSerialization.jsonObject(with:d)) as? [String:Any] {await self.handle(m)};self.receive(ws)
            }
        }}
    }
    func handle(_ m:[String:Any]) async {
        switch m["type"] as? String {
        case "code":code=m["code"] as? String ?? "------";if peer==nil {status="Ready to connect"};devices=(m["devices"] as? [[String:Any]] ?? []).compactMap{d in guard let id=d["id"] as? String,let name=d["name"] as? String else{return nil};return Device(id:id,name:name)}
        case "approval":if let id=m["id"] as? String,let name=m["name"] as? String {approval=(id,name);NSApp.activate(ignoringOtherApps:true)}
        case "start":
            stopPeer();error="";session=m["session"] as? String ?? "";status="Starting desktop capture…"
            guard CGPreflightScreenCaptureAccess() else {error="Screen Recording is not authorized for this DeskDeck Host build. Allow it in System Settings, then quit and reopen DeskDeck Host.";send(["type":"error","session":session,"message":error]);status="Screen Recording permission needed";return}
            guard AXIsProcessTrusted() else {error="Accessibility is not authorized for this DeskDeck Host build. Allow DeskDeck Host in System Settings → Privacy & Security → Accessibility.";send(["type":"error","session":session,"message":error]);status="Accessibility permission needed";return}
            let sid=session,id=UUID();activePeerID=id
            let p=DesktopPeer(signal:{[weak self] value in Task{@MainActor in guard let self=self,self.activePeerID==id,self.session==sid,self.peer != nil else{return};var v=value;v["session"]=sid;self.send(v)}},state:{[weak self] s in Task{@MainActor in guard let self=self,self.activePeerID==id,self.session==sid,self.peer != nil else{return};self.status=s}});peer=p
            do{try await p.start()}catch{guard peer===p,session==sid else{return};self.error=error.localizedDescription;send(["type":"error","session":sid,"message":error.localizedDescription]);stopPeer();status="Desktop capture failed"}
        case "offer","ice":if m["session"] as? String==session {peer?.receive(m)}
        case "stop":stopPeer();error="";status="Ready to connect"
        default:break
        }
    }
    func approve(_ allow:Bool) {if let a=approval{send(["type":"approval","id":a.id,"allow":allow])};approval=nil}
    func screenPermission() {CGRequestScreenCaptureAccess();NSWorkspace.shared.open(URL(string:"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)}
    func inputPermission() {let options=[kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String:true] as CFDictionary;_ = AXIsProcessTrustedWithOptions(options)}
    private func stopPeer() {let p=peer;peer=nil;activePeerID=nil;session="";p?.stop()}
    func disconnect() {stopPeer();error="";send(["type":"disconnect"]);status="Ready to connect"}
    private func loadSecret()->Data? {var item:CFTypeRef?;let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"DeskDeckHost",kSecAttrAccount as String:"server",kSecReturnData as String:true];return SecItemCopyMatching(q as CFDictionary,&item)==errSecSuccess ? item as? Data:nil}
    private func saveSecret(_ data:Data)throws {let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"DeskDeckHost",kSecAttrAccount as String:"server"];SecItemDelete(q as CFDictionary);var a=q;a[kSecValueData as String]=data;a[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;let s=SecItemAdd(a as CFDictionary,nil);if s != errSecSuccess{throw NSError(domain:NSOSStatusErrorDomain,code:Int(s))}}
}
struct Dashboard:View {
    @ObservedObject var model:HostModel
    @State var removing:Device?
    var qr:NSImage? {let f=CIFilter.qrCodeGenerator();f.message=Data(model.website.utf8);guard let output=f.outputImage?.transformed(by:CGAffineTransform(scaleX:5,y:5)),let cg=CIContext().createCGImage(output,from:output.extent) else{return nil};return NSImage(cgImage:cg,size:NSSize(width:140,height:140))}
    var body:some View {
        VStack(alignment:.leading,spacing:18){
            HStack{Image(systemName:"visionpro").font(.largeTitle);Text("DESKDECK VR").font(.headline);Spacer();Circle().fill(model.peer==nil ? Color.blue:Color.green).frame(width:8,height:8)}
            Text("Connect your headset").font(.largeTitle.weight(.medium));Text(model.status).foregroundStyle(.secondary)
            HStack(spacing:24){if !model.website.isEmpty,let qr{Image(nsImage:qr).interpolation(.none).padding(8).background(.white)};VStack(alignment:.leading,spacing:12){Text("PAIRING CODE").font(.caption);Text(model.code).font(.system(size:36,weight:.medium,design:.monospaced));Text(model.website).textSelection(.enabled).font(.caption);Button("Renew code"){model.send(["type":"rotate"])}}}
            Divider();Text("Permissions").font(.headline)
            Text("Screen Recording shares your desktop. Accessibility lets your headset move the pointer and type. Microphone and Input Monitoring are not used.").font(.callout).foregroundStyle(.secondary)
            HStack{Button("Allow Screen Recording",action:model.screenPermission);Button("Allow Accessibility",action:model.inputPermission)}
            if let a=model.approval {VStack(alignment:.leading){Text("Allow \(a.name) to control this Mac?").font(.headline);Text("Only approve a headset you are pairing now.");HStack{Button("Decline"){model.approve(false)};Button("Allow device"){model.approve(true)}.buttonStyle(.borderedProminent)}}.padding().background(Color.blue.opacity(0.12))}
            if !model.devices.isEmpty {Text("Trusted devices").font(.headline);ForEach(model.devices){d in HStack{Text(d.name);Spacer();Button("Remove"){removing=d}}}}
            if !model.error.isEmpty{Text(model.error).foregroundStyle(.orange).font(.caption).textSelection(.enabled)}
            Spacer();HStack{Button("Import server config",action:model.importConfig);Spacer();Button("Disconnect",action:model.disconnect)}
        }.padding(28).frame(width:560,height:690)
        .confirmationDialog("Remove trusted device?",isPresented:Binding(get:{removing != nil},set:{if !$0{removing=nil}}),titleVisibility:.visible){Button("Remove device",role:.destructive){if let d=removing{model.send(["type":"revoke","id":d.id])};removing=nil};Button("Cancel",role:.cancel){removing=nil}}message:{Text("This device will be disconnected and must pair again.")}
    }
}
@main struct DeskDeckApp:App {
    @StateObject var model=HostModel()
    var body:some Scene {
        WindowGroup("DeskDeck Host",id:"dashboard"){Dashboard(model:model)}.windowResizability(.contentSize)
        MenuBarExtra("DeskDeck VR",systemImage:"visionpro") {MenuContent(model:model)}
    }
}
struct MenuContent:View {
    @ObservedObject var model:HostModel
    @Environment(\.openWindow) var openWindow
    @State var loginError=""
    var body:some View {Text("DeskDeck VR");Text(model.status);Divider();Button("Open dashboard"){openWindow(id:"dashboard");NSApp.activate(ignoringOtherApps:true)};Button("Disconnect",action:model.disconnect);Button("Toggle launch at login"){do{if SMAppService.mainApp.status == .enabled{try SMAppService.mainApp.unregister()}else{try SMAppService.mainApp.register()}}catch{loginError=error.localizedDescription}};if !loginError.isEmpty{Text(loginError)};Divider();Button("Quit DeskDeck"){model.disconnect();NSApp.terminate(nil)}}
}
