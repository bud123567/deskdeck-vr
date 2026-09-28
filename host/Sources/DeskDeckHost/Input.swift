import AppKit
import ApplicationServices

/// Only structured, allowlisted actions are accepted. No shell, AppleScript or paths from the client.
final class RemoteInput {
    var bounds = CGDisplayBounds(CGMainDisplayID())
    private var held = Set<CGKeyCode>()
    private var buttons = Set<Int>()
    private var point = CGPoint.zero
    static let keys: [String: CGKeyCode] = ["KeyA":0,"KeyS":1,"KeyD":2,"KeyF":3,"KeyH":4,"KeyG":5,"KeyZ":6,"KeyX":7,"KeyC":8,"KeyV":9,"KeyB":11,"KeyQ":12,"KeyW":13,"KeyE":14,"KeyR":15,"KeyY":16,"KeyT":17,"Digit1":18,"Digit2":19,"Digit3":20,"Digit4":21,"Digit6":22,"Digit5":23,"Equal":24,"Digit9":25,"Digit7":26,"Minus":27,"Digit8":28,"Digit0":29,"BracketRight":30,"KeyO":31,"KeyU":32,"BracketLeft":33,"KeyI":34,"KeyP":35,"Enter":36,"KeyL":37,"KeyJ":38,"Quote":39,"KeyK":40,"Semicolon":41,"Backslash":42,"Comma":43,"Slash":44,"KeyN":45,"KeyM":46,"Period":47,"Tab":48,"Space":49,"Backquote":50,"Backspace":51,"Escape":53,"MetaLeft":55,"MetaRight":54,"ShiftLeft":56,"ShiftRight":60,"AltLeft":58,"AltRight":61,"ControlLeft":59,"ControlRight":62,"CapsLock":57,"F1":122,"F2":120,"F3":99,"F4":118,"F5":96,"F6":97,"F7":98,"F8":100,"F9":101,"F10":109,"F11":103,"F12":111,"Delete":117,"Home":115,"End":119,"PageUp":116,"PageDown":121,"ArrowLeft":123,"ArrowRight":124,"ArrowDown":125,"ArrowUp":126]
    private func flags(_ m: [String:Any]) -> CGEventFlags {
        var f: CGEventFlags = []
        if m["meta"] as? Bool == true { f.insert(.maskCommand) }
        if m["shift"] as? Bool == true { f.insert(.maskShift) }
        if m["alt"] as? Bool == true { f.insert(.maskAlternate) }
        if m["ctrl"] as? Bool == true { f.insert(.maskControl) }
        return f
    }
    func releaseAll() {
        for k in held { CGEvent(keyboardEventSource:nil,virtualKey:k,keyDown:false)?.post(tap:.cghidEventTap) }; held.removeAll()
        for b in buttons { mouse(b, down:false) }; buttons.removeAll()
    }
    private func mouse(_ b:Int, down:Bool) {
        let right=b==2
        let t: CGEventType = right ? (down ? .rightMouseDown:.rightMouseUp) : (down ? .leftMouseDown:.leftMouseUp)
        CGEvent(mouseEventSource:nil,mouseType:t,mouseCursorPosition:point,mouseButton:right ? .right:.left)?.post(tap:.cghidEventTap)
    }
    func handle(_ m: [String:Any]) {
        guard AXIsProcessTrusted(), let type=m["type"] as? String else {return}
        switch type {
        case "release": releaseAll()
        case "pointer":
            guard let x=m["x"] as? Double, let y=m["y"] as? Double, x.isFinite, y.isFinite else{return}
            point=CGPoint(x:bounds.minX+min(1,max(0,x))*max(1,bounds.width-1),y:bounds.minY+min(1,max(0,y))*max(1,bounds.height-1))
            let t: CGEventType = buttons.contains(0) ? .leftMouseDragged : buttons.contains(2) ? .rightMouseDragged : .mouseMoved
            CGEvent(mouseEventSource:nil,mouseType:t,mouseCursorPosition:point,mouseButton:buttons.contains(2) ? .right:.left)?.post(tap:.cghidEventTap)
        case "button":
            guard let b=m["button"] as? Int, [0,2].contains(b),let down=m["down"] as? Bool else{return}
            if down {buttons.insert(b)} else {buttons.remove(b)};mouse(b,down:down)
        case "scroll":
            guard let y=m["y"] as? Double,y.isFinite else{return}
            CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:1,wheel1:Int32(min(250,max(-250,-y))),wheel2:0,wheel3:0)?.post(tap:.cghidEventTap)
        case "key":
            guard let code=m["code"] as? String, let k=Self.keys[code],let down=m["down"] as? Bool else{return}
            if down {held.insert(k)} else {held.remove(k)}
            let e=CGEvent(keyboardEventSource:nil,virtualKey:k,keyDown:down);e?.flags=flags(m);e?.post(tap:.cghidEventTap)
        case "text":
            guard let text=m["text"] as? String,text.utf16.count<=2048 else{return}
            for c in text { let u=Array(String(c).utf16);for down in [true,false] {let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down);e?.keyboardSetUnicodeString(stringLength:u.count,unicodeString:u);e?.post(tap:.cghidEventTap)} }
        case "shortcut":
            let actions: [String: ([CGKeyCode],CGEventFlags)] = ["switch":([48],.maskCommand),"spotlight":([49],.maskCommand),"copy":([8],.maskCommand),"paste":([9],.maskCommand),"undo":([6],.maskCommand),"screenshot":([21],[.maskCommand,.maskShift]),"mission":([126],.maskControl),"desktop":([103],[]),"lock":([12],[.maskCommand,.maskControl])]
            guard let id=m["id"] as? String,let (ks,f)=actions[id] else{return}
            for k in ks {for down in [true,false] {let e=CGEvent(keyboardEventSource:nil,virtualKey:k,keyDown:down);e?.flags=f;e?.post(tap:.cghidEventTap)}}
        case "launch":
            let apps=["finder":"com.apple.finder","safari":"com.apple.Safari","chrome":"com.google.Chrome","messages":"com.apple.MobileSMS","spotify":"com.spotify.client","terminal":"com.apple.Terminal","vscode":"com.microsoft.VSCode"]
            guard let id=m["id"] as? String,let bundle=apps[id],let url=NSWorkspace.shared.urlForApplication(withBundleIdentifier:bundle) else{return}
            NSWorkspace.shared.openApplication(at:url,configuration:NSWorkspace.OpenConfiguration())
        default: break
        }
    }
}
