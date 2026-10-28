(() => {
  "use strict";

  const el = {
    status: document.getElementById("status"),
    sep: document.getElementById("sep"),
    timer: document.getElementById("timer"),
    startBtn: document.getElementById("startBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    fmtPopup: document.getElementById("fmtPopup"),
    mp4Option: document.getElementById("mp4Option"),
    audioOption: document.getElementById("audioOption"),
  };

  const state = {
    recorders: [],
    chunksOf: { webm: [], mp4: [], audio: [] },
    blobs: { webm: null, mp4: null, audio: null },
    urls: { webm: null, mp4: null, audio: null },
    timerId: null,
    seconds: 0,
    pending: 0,
    recording: false,
  };

  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  function setStatus(text) {
    el.status.textContent = text;
  }

  function pickMime(list, fallback) {
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || fallback;
  }

  async function start() {
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setStatus("Tu navegador no soporta grabación de pantalla.");
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: { echoCancellation: false, noiseSuppression: false },
        systemAudio: "include",
      });

      state.blobs = { webm: null, mp4: null, audio: null };
      state.chunksOf = { webm: [], mp4: [], audio: [] };
      el.downloadBtn.hidden = true;
      el.fmtPopup.hidden = true;
      state.pending = 0;
      state.recording = true;

      const hasAudio = display.getAudioTracks().length > 0;

      // Grabador WebM de video (siempre)
      const webmMime = pickMime(
        ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
        "video/webm"
      );
      const mrWebm = new MediaRecorder(display, {
        mimeType: webmMime,
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 128_000,
      });
      state.pending += 1;

      // Grabador MP4 de video (sólo si el navegador soporta H.264 + AAC reales)
      const mp4Mime = pickMime(
        ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1.640028,mp4a.40.2"],
        null
      );
      const mrMp4 = mp4Mime ? new MediaRecorder(display, { mimeType: mp4Mime }) : null;
      if (mrMp4) state.pending += 1;

      // Grabador sólo audio (si hay pista de audio)
      const audioMime = pickMime(
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
        null
      );
      const mrAudio =
        hasAudio && audioMime
          ? new MediaRecorder(new MediaStream(display.getAudioTracks()), { mimeType: audioMime })
          : null;
      if (mrAudio) state.pending += 1;

      const onChunk = (key) => (e) => e.data.size > 0 && state.chunksOf[key].push(e.data);

      mrWebm.ondataavailable = onChunk("webm");
      if (mrMp4) mrMp4.ondataavailable = onChunk("mp4");
      if (mrAudio) mrAudio.ondataavailable = onChunk("audio");

      mrWebm.onstop = () => {
        state.blobs.webm = new Blob(state.chunksOf.webm, { type: mrWebm.mimeType || "video/webm" });
        checkDone();
      };
      if (mrMp4) mrMp4.onstop = () => {
        state.blobs.mp4 = new Blob(state.chunksOf.mp4, { type: mrMp4.mimeType || "video/mp4" });
        checkDone();
      };
      if (mrAudio) mrAudio.onstop = () => {
        state.blobs.audio = new Blob(state.chunksOf.audio, { type: mrAudio.mimeType || "audio/webm" });
        checkDone();
      };

      display.getVideoTracks()[0].addEventListener("ended", stop);
      display.getAudioTracks().forEach((t) => t.addEventListener("ended", stop));

      [mrWebm, mrMp4, mrAudio].filter(Boolean).forEach((r) => {
        r.start();
        state.recorders.push(r);
      });

      document.body.classList.add("is-recording");
      el.sep.hidden = false;
      el.timer.hidden = false;
      setStatus("Grabando…" + (hasAudio ? "" : " (sin audio: tildá «Compartir audio del sistema»)"));
      state.seconds = 0;
      el.timer.textContent = fmt(0);
      state.timerId = setInterval(() => {
        state.seconds += 1;
        el.timer.textContent = fmt(state.seconds);
      }, 1000);

    } catch (err) {
      setStatus(err.name === "NotAllowedError" ? "Permiso cancelado." : "Error al iniciar.");
    }
  }

  function stop() {
    if (!state.recording) return;
    state.recorders.forEach((r) => r.state !== "inactive" && r.stop());
    state.recorders = [];
    state.recording = false;
  }

  function checkDone() {
    state.pending -= 1;
    if (state.pending > 0) return;

    clearInterval(state.timerId);
    document.body.classList.remove("is-recording");
    el.timer.hidden = true;
    el.sep.hidden = true;
    state.chunksOf = null;

    for (const key of ["webm", "mp4", "audio"]) {
      if (state.urls[key]) {
        URL.revokeObjectURL(state.urls[key]);
        state.urls[key] = null;
      }
    }

    // Muestra el botón de descarga sólo si hay contenido
    const hasData = state.blobs.webm && state.blobs.webm.size > 0;
    if (!hasData) {
      state.hasMp4 = state.hasAudioRec = false;
      setStatus("No se capturó nada. Presiona para grabar.");
      return;
    }

    if (state.blobs.webm) state.urls.webm = URL.createObjectURL(state.blobs.webm);
    state.hasMp4 = Boolean(state.blobs.mp4 && state.blobs.mp4.size > 0);
    if (state.hasMp4) {
      state.urls.mp4 = URL.createObjectURL(state.blobs.mp4);
      el.mp4Option.disabled = false;
    }
    state.hasAudioRec = Boolean(state.blobs.audio && state.blobs.audio.size > 0);
    if (state.hasAudioRec) {
      state.urls.audio = URL.createObjectURL(state.blobs.audio);
      el.audioOption.disabled = false;
    }

    el.downloadBtn.hidden = false;
    el.downloadBtn.disabled = false;
    setStatus("Grabación lista");
  }

  function download(key) {
    const url = state.urls[key];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    const ext = key === "audio" ? state.blobs.audio.type.includes("mp4") ? "m4a" : "weba" : key;
    a.download = `screencast-${stamp()}.${ext}`;
    a.click();
    el.fmtPopup.hidden = true;
  }

  function closePopup(e) {
    if (!el.fmtPopup.hidden && !el.fmtPopup.contains(e.target) && !el.downloadBtn.contains(e.target)) {
      el.fmtPopup.hidden = true;
    }
  }

  el.startBtn.addEventListener("click", () => (state.recording ? stop() : start()));

  el.downloadBtn.addEventListener("click", () => {
    if (el.downloadBtn.hidden) return;
    el.fmtPopup.hidden = !el.fmtPopup.hidden;
  });

  document.querySelectorAll(".fmt").forEach((btn) => {
    btn.addEventListener("click", () => download(btn.dataset.fmt));
  });

  document.addEventListener("click", closePopup);

  window.addEventListener("beforeunload", () => {
    ["webm", "mp4", "audio"].forEach((k) => state.urls[k] && URL.revokeObjectURL(state.urls[k]));
  });
})();
