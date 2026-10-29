(() => {
  "use strict";

  const el = {
    status: document.getElementById("status"),
    sep: document.getElementById("sep"),
    timer: document.getElementById("timer"),
    startBtn: document.getElementById("startBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    fmtPopup: document.getElementById("fmtPopup"),
    webmOption: document.getElementById("webmOption"),
    mp4Option: document.getElementById("mp4Option"),
    audioOption: document.getElementById("audioOption"),
    gifOption: document.getElementById("gifOption"),
  };

  const GIF_ENCODER_URL = "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js";
  const LAME_URL = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
  let gifBusy = false;
  let audioBusy = false;
  let lamePromise = null;

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
      el.webmOption.disabled = true;
      el.mp4Option.disabled = true;
      el.audioOption.disabled = true;
      el.audioOption.hidden = true;
      el.gifOption.disabled = true;
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

      // Grabador MP4 de video (sólo si el navegador soporta H.264 + AAC reales)
      const mp4Mime = pickMime(
        ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4d002a,mp4a.40.2", "video/mp4;codecs=avc1.640028,mp4a.40.2"],
        null
      );
      const mrMp4 = mp4Mime ? safeRecorder(display, { mimeType: mp4Mime }) : null;
      if (!mrWebm && !mrMp4) throw new Error("no-recorder-supported");

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

      if (mrWebm) {
        mrWebm.ondataavailable = onChunk("webm");
        mrWebm.onstop = onStop("webm", mrWebm);
      }
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
    state.chunksOf = null;
    state.lastDuration = state.seconds;

    el.timer.textContent = fmt(state.lastDuration);
    el.timer.hidden = false;
    el.sep.hidden = false;

    for (const key of ["webm", "mp4", "audio"]) {
      if (state.urls[key]) {
        URL.revokeObjectURL(state.urls[key]);
        state.urls[key] = null;
      }
    }

    // Muestra el botón de descarga sólo si hay contenido
    state.hasWebm = Boolean(state.blobs.webm && state.blobs.webm.size > 0);
    state.hasMp4 = Boolean(state.blobs.mp4 && state.blobs.mp4.size > 0);
    state.hasAudioRec = Boolean(state.blobs.audio && state.blobs.audio.size > 0);
    const hasData = state.hasWebm || state.hasMp4;

    el.webmOption.disabled = !state.hasWebm;
    el.mp4Option.disabled = !state.hasMp4;
    el.audioOption.disabled = !state.hasAudioRec;
    el.audioOption.hidden = !state.hasAudioRec;

    if (!hasData) {
      el.gifOption.disabled = true;
      el.timer.hidden = true;
      el.sep.hidden = true;
      setStatus("No se capturó nada. Presiona para grabar.");
      return;
    }

    if (state.hasWebm) state.urls.webm = URL.createObjectURL(state.blobs.webm);
    if (state.hasMp4) state.urls.mp4 = URL.createObjectURL(state.blobs.mp4);
    if (state.hasAudioRec) state.urls.audio = URL.createObjectURL(state.blobs.audio);

    el.gifOption.disabled = false;
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

  function seekTo(video, t) {
    if (Math.abs(video.currentTime - t) < 1e-3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (fn, arg) => {
        clearTimeout(timer);
        video.removeEventListener("seeked", onSeek);
        video.onerror = null;
        fn(arg);
      };
      const timer = setTimeout(() => done(reject, new Error("seek-timeout")), 10000);
      const onSeek = () => done(resolve);
      video.addEventListener("seeked", onSeek);
      video.onerror = () => done(reject, new Error("seek-failed"));
      video.currentTime = t;
    });
  }

  async function sourceToGif(blob, gen, onProgress) {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("video-timeout")), 15000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error("video-load"));
        };
      });

      // Chrome reporta duration = Infinity en blobs grabados: forzar fin del stream
      if (!isFinite(video.duration)) {
        video.currentTime = 1e101;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 3000);
          video.addEventListener("seeked", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }

      let duration = video.duration;
      if (!isFinite(duration) || duration <= 0) duration = state.lastDuration || 0;
      if (!duration || !video.videoWidth) throw new Error("bad-video");

      const FPS = 10;
      const MAX_W = 640;
      const scale = Math.min(1, MAX_W / video.videoWidth);
      const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
      const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      const { GIFEncoder, quantize, applyPalette } = await import(GIF_ENCODER_URL);
      const gif = GIFEncoder();
      const total = Math.max(1, Math.ceil(duration * FPS));

      for (let i = 0; i < total; i++) {
        if (state.gen !== gen) throw new Error("cancelled");
        await seekTo(video, Math.min(duration - 0.001, i / FPS));
        ctx.drawImage(video, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const palette = quantize(data, 256);
        gif.writeFrame(applyPalette(data, palette, "rgb565"), w, h, {
          palette,
          delay: 1000 / FPS,
        });
        onProgress(Math.round(((i + 1) / total) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }

      gif.finish();
      return new Blob([gif.bytes()], { type: "image/gif" });
    } finally {
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  async function makeGif() {
    if (gifBusy) return;
    const gen = state.gen;
    const source = state.hasWebm ? state.blobs.webm : state.blobs.mp4;
    if (!source || source.size === 0) return;

    gifBusy = true;
    el.gifOption.disabled = true;
    el.fmtPopup.hidden = true;

    try {
      setStatus("Preparando GIF…");
      const gif = await sourceToGif(source, gen, (pct) => {
        if (state.gen === gen) setStatus(`Convirtiendo a GIF… ${pct}%`);
      });
      if (state.gen !== gen) return;

      const url = URL.createObjectURL(gif);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screencast-${stamp()}.gif`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("GIF descargado");
    } catch {
      if (state.gen === gen) setStatus("No se pudo generar el GIF.");
    } finally {
      gifBusy = false;
      if (state.gen === gen) el.gifOption.disabled = false;
    }
  }

  function loadLame() {
    if (window.lamejs) return Promise.resolve(window.lamejs);
    if (!lamePromise) {
      lamePromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LAME_URL;
        s.onload = () => {
          if (window.lamejs) resolve(window.lamejs);
          else {
            lamePromise = null;
            reject(new Error("lame-load"));
          }
        };
        s.onerror = () => {
          lamePromise = null;
          reject(new Error("lame-load"));
        };
        document.head.appendChild(s);
      });
    }
    return lamePromise;
  }

  function toInt16(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  async function toMp3(blob, gen, onProgress) {
    const lamejs = await loadLame();

    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error("no-audio-api");
    const audioBuffer = await new OfflineCtx(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());

    if (state.gen !== gen) throw new Error("cancelled");

    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const encoder = new lamejs.Mp3Encoder(channels, audioBuffer.sampleRate, 128);
    const left = toInt16(audioBuffer.getChannelData(0));
    const right = channels > 1 ? toInt16(audioBuffer.getChannelData(1)) : null;

    const BLOCK = 1152 * 50;
    const parts = [];
    for (let i = 0; i < left.length; i += BLOCK) {
      if (state.gen !== gen) throw new Error("cancelled");
      const l = left.subarray(i, i + BLOCK);
      const chunk = right
        ? encoder.encodeBuffer(l, right.subarray(i, i + BLOCK))
        : encoder.encodeBuffer(l);
      if (chunk.length > 0) parts.push(chunk);
      onProgress(Math.min(99, Math.round(((i + BLOCK) / left.length) * 100)));
      await new Promise((r) => setTimeout(r, 0));
    }

    const end = encoder.flush();
    if (end.length > 0) parts.push(end);
    onProgress(100);
    return new Blob(parts, { type: "audio/mpeg" });
  }

  async function downloadAudio() {
    if (audioBusy) return;
    const gen = state.gen;
    const source = state.blobs.audio;
    if (!source || source.size === 0) return;

    audioBusy = true;
    el.audioOption.disabled = true;
    el.fmtPopup.hidden = true;

    try {
      setStatus("Preparando MP3…");
      const mp3 = await toMp3(source, gen, (pct) => {
        if (state.gen === gen) setStatus(`Convirtiendo a MP3… ${pct}%`);
      });
      if (state.gen !== gen) return;

      const url = URL.createObjectURL(mp3);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screencast-${stamp()}.mp3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("MP3 descargado");
    } catch {
      if (state.gen === gen) setStatus("No se pudo generar el MP3.");
    } finally {
      audioBusy = false;
      if (state.gen === gen) el.audioOption.disabled = false;
    }
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
    btn.addEventListener("click", () => {
      const key = btn.dataset.fmt;
      if (key === "gif") makeGif();
      else if (key === "audio") downloadAudio();
      else download(key);
    });
  });

  document.addEventListener("click", closePopup);

  window.addEventListener("beforeunload", () => {
    ["webm", "mp4", "audio"].forEach((k) => state.urls[k] && URL.revokeObjectURL(state.urls[k]));
  });
})();

// Miller
