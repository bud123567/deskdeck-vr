import AppKit

import Foundation
import ScreenCaptureKit
import WebRTC
import CoreMedia

final class DesktopCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    var stream: SCStream?
    let source: RTCVideoSource
    lazy var capturer = RTCVideoCapturer(delegate: source)
    var onError: ((String)->Void)?
    init(source:RTCVideoSource) {self.source=source;super.init()}
    func start(display:SCDisplay, width:Int=1920, fps:Int=60) async throws {
        let filter=SCContentFilter(display:display,excludingWindows:[])
        let c=SCStreamConfiguration();c.width=width;c.height=Int(Double(width)*Double(display.height)/Double(display.width));c.minimumFrameInterval=CMTime(value:1,timescale:CMTimeScale(fps));c.queueDepth=3;c.pixelFormat=kCVPixelFormatType_420YpCbCr8BiPlanarFullRange;c.showsCursor=true;c.capturesAudio=false
        let s=SCStream(filter:filter,configuration:c,delegate:self);stream=s
        try s.addStreamOutput(self,type:.screen,sampleHandlerQueue:DispatchQueue(label:"deskdeck.capture",qos:.userInteractive));try await s.startCapture()
    }
    func stop() {if let s=stream {Task {try? await s.stopCapture()}};stream=nil}
    func stream(_ stream:SCStream,didStopWithError error:Error) {onError?(error.localizedDescription)}
    func stream(_ stream:SCStream,didOutputSampleBuffer sampleBuffer:CMSampleBuffer,of type:SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,let pixel=CMSampleBufferGetImageBuffer(sampleBuffer),let info=CMSampleBufferGetSampleAttachmentsArray(sampleBuffer,createIfNecessary:false) as? [[SCStreamFrameInfo:Any]],let status=info.first?[.status] as? Int,status==SCFrameStatus.complete.rawValue else{return}
        let frame=RTCVideoFrame(buffer:RTCCVPixelBuffer(pixelBuffer:pixel),rotation:._0,timeStampNs:Int64(CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds*1_000_000_000))
        capturer.delegate?.capturer(capturer,didCapture:frame)
    }
}

final class DesktopPeer: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    private static let factory:RTCPeerConnectionFactory = {RTCInitializeSSL();let encoder=RTCVideoEncoderFactoryH264();return RTCPeerConnectionFactory(encoderFactory:encoder,decoderFactory:RTCDefaultVideoDecoderFactory())}()
    var logger:RTCFileLogger?;var pc:RTCPeerConnection!;var channel:RTCDataChannel?;var capture:DesktopCapture?;let input=RemoteInput()
    var signal: ([String:Any])->Void
    var state: (String)->Void
    var remoteSet=false;var candidates:[RTCIceCandidate]=[]
    var displays:[SCDisplay]=[];var source:RTCVideoSource!;var closed=false
    init(signal:@escaping([String:Any])->Void,state:@escaping(String)->Void) {
        self.signal=signal;self.state=state;super.init()
        if ProcessInfo.processInfo.environment["DESKDECK_DIAGNOSTICS"] == "1" {
            let path=NSHomeDirectory()+"/Library/Logs/DeskDeck";try? FileManager.default.createDirectory(atPath:path,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700]);logger=RTCFileLogger(dirPath:path,maxFileSize:1024*1024);logger?.severity = .warning;logger?.start()
        }
        let c=RTCConfiguration();c.sdpSemantics = .unifiedPlan;c.iceServers=[]
        pc=Self.factory.peerConnection(with:c,constraints:RTCMediaConstraints(mandatoryConstraints:nil,optionalConstraints:nil),delegate:self)
        source=Self.factory.videoSource(forScreenCast:true)
        let track=Self.factory.videoTrack(with:source,trackId:"desktop");pc.add(track,streamIds:["mac-desktop"])
    }
    func start() async throws {
        let content=try await SCShareableContent.excludingDesktopWindows(true,onScreenWindowsOnly:true)
        guard !closed,let display=content.displays.first(where:{$0.displayID==CGMainDisplayID()}) ?? content.displays.first else{return}
        displays=content.displays;input.bounds=CGDisplayBounds(display.displayID)
        let capture=DesktopCapture(source:source);capture.onError={ [weak self] s in self?.signal(["type":"error","message":s]) };self.capture=capture
        try await capture.start(display:display)
    }
    func receive(_ m:[String:Any]) {
        guard !closed,let type=m["type"] as? String else{return}
        if type=="offer",let sdp=m["sdp"] as? String {
            pc.setRemoteDescription(RTCSessionDescription(type:.offer,sdp:sdp)){[weak self] error in
                guard let self=self,!self.closed else{return};if let error {self.signal(["type":"error","message":error.localizedDescription]);return}
                self.remoteSet=true;for c in self.candidates {self.pc.add(c,completionHandler:{_ in})};self.candidates=[]
                self.pc.answer(for:RTCMediaConstraints(mandatoryConstraints:nil,optionalConstraints:nil)){sdp,error in
                    guard let sdp=sdp,!self.closed else{return}
                    self.pc.setLocalDescription(sdp){error in if error==nil {self.signal(["type":"answer","sdp":sdp.sdp])}}
                }
            }
        } else if type=="ice",let c=m["candidate"] as? [String:Any],let s=c["candidate"] as? String {
            let ice=RTCIceCandidate(sdp:s,sdpMLineIndex:Int32(c["sdpMLineIndex"] as? Int ?? 0),sdpMid:c["sdpMid"] as? String)
            if remoteSet {pc.add(ice,completionHandler:{_ in})} else {candidates.append(ice)}
        }
    }
    func stop() {closed=true;capture?.stop();capture=nil;channel?.close();pc?.close();DispatchQueue.main.async {self.input.releaseAll()}}
    func send(_ m:[String:Any]) {guard let d=try? JSONSerialization.data(withJSONObject:m),channel?.readyState == .open else{return};channel?.sendData(RTCDataBuffer(data:d,isBinary:false))}
    func dataChannelDidChangeState(_ dataChannel:RTCDataChannel) {if dataChannel.readyState == .open {send(["type":"displays","displays":displays.map{["id":$0.displayID,"width":$0.width,"height":$0.height]}])}else{DispatchQueue.main.async{self.input.releaseAll()}}}
    func dataChannel(_ dataChannel:RTCDataChannel,didReceiveMessageWith buffer:RTCDataBuffer) {
        guard buffer.data.count<8192,let m=(try? JSONSerialization.jsonObject(with:buffer.data)) as? [String:Any] else{return}
        DispatchQueue.main.async { [weak self] in guard let self=self,!self.closed else{return}
            if m["type"] as? String == "clipboardRead" {self.send(["type":"clipboard","text":String((NSPasteboard.general.string(forType:.string) ?? "").prefix(4096))])}
            else if m["type"] as? String == "clipboardWrite",let text=m["text"] as? String,text.count<=4096 {NSPasteboard.general.clearContents();NSPasteboard.general.setString(text,forType:.string)}
            else {self.input.handle(m); self.send(["type":"inputAck","action":m["type"] as? String ?? "unknown","trusted":AXIsProcessTrusted()])}
        }
    }
    func peerConnection(_ peerConnection:RTCPeerConnection,didGenerate candidate:RTCIceCandidate) {signal(["type":"ice","candidate":["candidate":candidate.sdp,"sdpMid":candidate.sdpMid ?? "0","sdpMLineIndex":candidate.sdpMLineIndex]])}
    func peerConnection(_ peerConnection:RTCPeerConnection,didChange newState:RTCPeerConnectionState) {state(String(describing:newState));if newState == .disconnected || newState == .failed || newState == .closed {DispatchQueue.main.async{self.input.releaseAll()}}}
    func peerConnection(_ peerConnection:RTCPeerConnection,didOpen dataChannel:RTCDataChannel) {guard dataChannel.label=="input" else{dataChannel.close();return};channel=dataChannel;dataChannel.delegate=self}
    func peerConnection(_ peerConnection:RTCPeerConnection,didChange stateChanged:RTCSignalingState) {}
    func peerConnection(_ peerConnection:RTCPeerConnection,didAdd stream:RTCMediaStream) {}
    func peerConnection(_ peerConnection:RTCPeerConnection,didRemove stream:RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection:RTCPeerConnection) {}
    func peerConnection(_ peerConnection:RTCPeerConnection,didChange newState:RTCIceConnectionState) {}
    func peerConnection(_ peerConnection:RTCPeerConnection,didChange newState:RTCIceGatheringState) {}
    func peerConnection(_ peerConnection:RTCPeerConnection,didRemove candidates:[RTCIceCandidate]) {}
}
