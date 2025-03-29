function forceVP9inSDP(sdp) {
  const sdpLines = sdp.split("\r\n");
  const mVideoIndex = sdpLines.findIndex((line) => line.startsWith("m=video"));
  if (mVideoIndex === -1) return sdp;

  let nextMLineIndex = sdpLines.findIndex(
    (line, i) => i > mVideoIndex && line.startsWith("m=")
  );
  if (nextMLineIndex === -1) nextMLineIndex = sdpLines.length;

  let videoBlock = sdpLines.slice(mVideoIndex, nextMLineIndex);
  const vp9Payloads = new Set();
  videoBlock.forEach((line) => {
    if (line.startsWith("a=rtpmap:") && line.toLowerCase().includes("vp9")) {
      const match = line.match(/^a=rtpmap:(\d+)\s/);
      if (match && match[1]) {
        vp9Payloads.add(match[1]);
      }
    }
  });
  if (vp9Payloads.size === 0) {
    console.warn("No se detectaron payloads VP9 en video. SDP inalterado.");
    return sdp;
  }
  const mLineParts = videoBlock[0].split(" ");
  const mHeader = mLineParts.slice(0, 3);
  const mPayloads = mLineParts.slice(3).filter((pt) => vp9Payloads.has(pt));
  if (mPayloads.length === 0) {
    console.warn(
      "No se encontró ningún payload VP9 en m=video. SDP inalterado."
    );
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
      return (
        payloadMatch && payloadMatch[1] && vp9Payloads.has(payloadMatch[1])
      );
    }
    return true;
  });
  const newSdpLines = [
    ...sdpLines.slice(0, mVideoIndex),
    ...videoBlock,
    ...sdpLines.slice(nextMLineIndex),
  ];
  return newSdpLines.join("\r\n");
}

// Intercepta setLocalDescription para forzar VP9 sin afectar el resto del SDP.
(function () {
  const originalSetLocalDescription =
    RTCPeerConnection.prototype.setLocalDescription;
  RTCPeerConnection.prototype.setLocalDescription = function (description) {
    if (description && description.sdp) {
      description.sdp = forceVP9inSDP(description.sdp);
    }
    return originalSetLocalDescription.apply(this, [description]);
  };
})();
2;
