function forceH264inSDP(sdp) {
    const sdpLines = sdp.split("\r\n");
    const mVideoIndex = sdpLines.findIndex((line) => line.startsWith("m=video"));
    if (mVideoIndex === -1) return sdp;
    
    let nextMLineIndex = sdpLines.findIndex((line, i) => i > mVideoIndex && line.startsWith("m="));
    if (nextMLineIndex === -1) nextMLineIndex = sdpLines.length;
    
    let videoBlock = sdpLines.slice(mVideoIndex, nextMLineIndex);
    const h264Payloads = new Set();
    videoBlock.forEach((line) => {
        if (line.startsWith("a=rtpmap:") && line.toLowerCase().includes("h264")) {
            const match = line.match(/^a=rtpmap:(\d+)\s/);
            if (match && match[1]) {
                h264Payloads.add(match[1]);
            }
        }
    });
    if (h264Payloads.size === 0) {
        console.warn("No se detectaron payloads H264 en video. SDP inalterado.");
        return sdp;
    }
    const mLineParts = videoBlock[0].split(" ");
    const mHeader = mLineParts.slice(0, 3);
    const mPayloads = mLineParts.slice(3).filter((pt) => h264Payloads.has(pt));
    if (mPayloads.length === 0) {
        console.warn("No se encontró ningún payload H264 en m=video. SDP inalterado.");
        return sdp;
    }
    videoBlock[0] = [...mHeader, ...mPayloads].join(" ");
    videoBlock = videoBlock.filter((line) => {
        if (
            line.startsWith("a=rtpmap:") ||
            line.startsWith("a=fmtp:") ||
            line.startsWith("a=rtcp-fb:")
        ) {
            const payloadMatch = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)/);
            return payloadMatch && payloadMatch[1] && h264Payloads.has(payloadMatch[1]);
        }
        return true;
    });
    const newSdpLines = [
        ...sdpLines.slice(0, mVideoIndex),
        ...videoBlock,
        ...sdpLines.slice(nextMLineIndex)
    ];
    return newSdpLines.join("\r\n");
}

// Intercepta setLocalDescription para forzar H264 sin afectar el resto del SDP.
(function() {
    const originalSetLocalDescription = RTCPeerConnection.prototype.setLocalDescription;
    RTCPeerConnection.prototype.setLocalDescription = function(description) {
        if (description && description.sdp) {
            description.sdp = forceH264inSDP(description.sdp);
            console.log("SDP modificado:", description.sdp);
        }
        return originalSetLocalDescription.apply(this, [description]);
    };
})();