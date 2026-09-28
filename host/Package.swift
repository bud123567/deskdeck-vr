// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "DeskDeckHost", platforms: [.macOS(.v14)], dependencies: [.package(url: "https://github.com/stasel/WebRTC.git", exact: "153.0.0")], targets: [.executableTarget(name: "DeskDeckHost", dependencies: [.product(name: "WebRTC", package: "WebRTC")])])
