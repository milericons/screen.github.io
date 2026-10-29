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
    starting: false,
    gen: 0,
    displayTracks: null,
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
    if (state.starting || state.recording) return;

    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setStatus("Tu navegador no soporta grabación de pantalla.");
      return;
    }

    state.starting = true;
    let display = null;

    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: { echoCancellation: false, noiseSuppression: false },
        systemAudio: "include",
      });

      const gen = ++state.gen;

      state.blobs = { webm: null, mp4: null, audio: null };
      state.chunksOf = { webm: [], mp4: [], audio: [] };
      state.recorders = [];
      for (const key of ["webm", "mp4", "audio"]) {
        if (state.urls[key]) {
          URL.revokeObjectURL(state.urls[key]);
          state.urls[key] = null;
        }
      }
      el.downloadBtn.hidden = true;
      el.fmtPopup.hidden = true;
      el.mp4Option.disabled = true;
      el.audioOption.disabled = true;
      el.audioOption.hidden = true;
      state.pending = 0;
      state.recording = true;
      state.displayTracks = display.getTracks();

      const safeRecorder = (stream, opts) => {
        try {
          return new MediaRecorder(stream, opts);
        } catch {
          return null;
        }
      };

      const hasAudio = display.getAudioTracks().length > 0;

      // Grabador WebM de video (siempre)
      const webmMime = pickMime(
        ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
        "video/webm"
      );
      const mrWebm = safeRecorder(display, {
        mimeType: webmMime,
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 128_000,
      });
      if (!mrWebm) throw new Error("webm-unsupported");

      // Grabador MP4 de video (sólo si el navegador soporta H.264 + AAC reales)
      const mp4Mime = pickMime(
        ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1.640028,mp4a.40.2"],
        null
      );
      const mrMp4 = mp4Mime ? safeRecorder(display, { mimeType: mp4Mime }) : null;

      // Grabador sólo audio (si hay pista de audio)
      const audioMime = pickMime(
        ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
        null
      );
      const mrAudio =
        hasAudio && audioMime
          ? safeRecorder(new MediaStream(display.getAudioTracks()), { mimeType: audioMime })
          : null;

      const onChunk = (key) => (e) => {
        if (state.gen !== gen || !state.chunksOf || e.data.size === 0) return;
        state.chunksOf[key].push(e.data);
      };

      const onStop = (key, rec) => () => {
        if (state.gen !== gen || !state.chunksOf) return;
        state.blobs[key] = new Blob(state.chunksOf[key], {
          type: rec.mimeType || (key === "audio" ? "audio/webm" : `video/${key}`),
        });
        checkDone();
      };

      mrWebm.ondataavailable = onChunk("webm");
      mrWebm.onstop = onStop("webm", mrWebm);
      if (mrMp4) {
        mrMp4.ondataavailable = onChunk("mp4");
        mrMp4.onstop = onStop("mp4", mrMp4);
      }
      if (mrAudio) {
        mrAudio.ondataavailable = onChunk("audio");
        mrAudio.onstop = onStop("audio", mrAudio);
      }

      display.getVideoTracks()[0].addEventListener("ended", stop);
      display.getAudioTracks().forEach((t) => t.addEventListener("ended", stop));

      [mrWebm, mrMp4, mrAudio].filter(Boolean).forEach((r) => {
        try {
          r.start();
          state.recorders.push(r);
        } catch {
          // grabador que no pudo arrancar: se omite
        }
      });

      if (state.recorders.length === 0) throw new Error("recorder-start-failed");
      state.pending = state.recorders.length;

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
      state.recording = false;
      state.recorders = [];
      state.pending = 0;
      state.displayTracks = null;
      if (display) display.getTracks().forEach((t) => t.stop());
      setStatus(err.name === "NotAllowedError" ? "Permiso cancelado." : "Error al iniciar.");
    } finally {
      state.starting = false;
    }
  }

  function stop() {
    if (!state.recording) return;
    state.recording = false;
    state.recorders.forEach((r) => r.state !== "inactive" && r.stop());
    state.recorders = [];
    (state.displayTracks || []).forEach((t) => t.stop());
    state.displayTracks = null;
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
      el.mp4Option.disabled = true;
      el.audioOption.disabled = true;
      el.audioOption.hidden = true;
      setStatus("No se capturó nada. Presiona para grabar.");
      return;
    }

    if (state.blobs.webm) state.urls.webm = URL.createObjectURL(state.blobs.webm);
    state.hasMp4 = Boolean(state.blobs.mp4 && state.blobs.mp4.size > 0);
    el.mp4Option.disabled = !state.hasMp4;
    if (state.hasMp4) state.urls.mp4 = URL.createObjectURL(state.blobs.mp4);

    state.hasAudioRec = Boolean(state.blobs.audio && state.blobs.audio.size > 0);
    el.audioOption.disabled = !state.hasAudioRec;
    el.audioOption.hidden = !state.hasAudioRec;
    if (state.hasAudioRec) state.urls.audio = URL.createObjectURL(state.blobs.audio);

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

// Miller
