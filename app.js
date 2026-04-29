const fallbackSongs = [
  {
    title: "한성의 이름 아래",
    folder: "한성의 이름 아래",
    tracks: [
      { name: "Vocals", file: "한성의 이름 아래 (Vocals).mp3" },
      { name: "Backing Vocals", file: "한성의 이름 아래 (Backing Vocals).mp3" },
      { name: "Guitar", file: "한성의 이름 아래 (Guitar).mp3" },
      { name: "Keyboard", file: "한성의 이름 아래 (Keyboard).mp3" },
      { name: "Synth", file: "한성의 이름 아래 (Synth).mp3" },
      { name: "Bass", file: "한성의 이름 아래 (Bass).mp3" },
      { name: "Drums", file: "한성의 이름 아래 (Drums).mp3" },
      { name: "Percussion", file: "한성의 이름 아래 (Percussion).mp3" },
    ],
  },
];

const state = {
  isPlaying: false,
  seeking: false,
  masterVolume: 0.8,
  duration: 0,
  playbackTime: 0,
  loopStart: 0,
  loopEnd: 0,
  loopEnabled: false,
  soloTrack: null,
  currentSongIndex: 0,
};

let songLibrary = fallbackSongs;
let currentSong = fallbackSongs[0];
let currentMetadata = {};
let tracks = currentSong.tracks;
let mixers = [];

const primaryTrackNames = ["Vocals", "Guitar", "Keyboard", "Bass", "Drums"];

const playButton = document.querySelector("#playButton");
const playIcon = document.querySelector("#playIcon");
const rewindButton = document.querySelector("#rewindButton");
const seekBar = document.querySelector("#seekBar");
const currentTimeLabel = document.querySelector("#currentTime");
const durationLabel = document.querySelector("#duration");
const songTitle = document.querySelector("#songTitle");
const songSelect = document.querySelector("#songSelect");
const youtubeButton = document.querySelector("#youtubeButton");
const loopStartRange = document.querySelector("#loopStartRange");
const loopEndRange = document.querySelector("#loopEndRange");
const loopToggleButton = document.querySelector("#loopToggleButton");
const loopStartValue = document.querySelector("#loopStartValue");
const loopEndValue = document.querySelector("#loopEndValue");
const loopSelection = document.querySelector("#loopSelection");
const masterVolume = document.querySelector("#masterVolume");
const masterVolumeValue = document.querySelector("#masterVolumeValue");
const trackList = document.querySelector("#trackList");
const template = document.querySelector("#trackTemplate");
const allOnButton = document.querySelector("#allOnButton");
const soloResetButton = document.querySelector("#soloResetButton");
const metronomeToggle = document.querySelector("#metronomeToggle");
const bpmInput = document.querySelector("#bpmInput");
const offsetDown10Button = document.querySelector("#offsetDown10Button");
const offsetDown1Button = document.querySelector("#offsetDown1Button");
const offsetUp1Button = document.querySelector("#offsetUp1Button");
const offsetUp10Button = document.querySelector("#offsetUp10Button");
const metronomeOffsetValue = document.querySelector("#metronomeOffsetValue");
const detectBpmButton = document.querySelector("#detectBpmButton");
const bpmStatus = document.querySelector("#bpmStatus");
const metronomeVolume = document.querySelector("#metronomeVolume");
const metronomeVolumeValue = document.querySelector("#metronomeVolumeValue");

const metronome = {
  audioContext: null,
  timer: null,
  isRunning: false,
  nextBeatTime: 0,
  beat: 0,
  volume: 0.5,
  offsetSeconds: 0,
};

function getSongFileUrl(song, file) {
  return `songs/${encodeURIComponent(song.folder)}/${encodeURIComponent(file)}`;
}

function getSongMetadataUrl(song) {
  return `songs/${encodeURIComponent(song.folder)}/metadata.json`;
}

function normalizeExternalUrl(url) {
  const trimmedUrl = typeof url === "string" ? url.trim() : "";
  if (/^(youtube\.com|www\.youtube\.com|youtu\.be)\//i.test(trimmedUrl)) {
    return `https://${trimmedUrl}`;
  }

  return trimmedUrl;
}

function isValidExternalUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    return false;
  }
}

function updateMetadataUi(metadata = {}) {
  currentMetadata = metadata;
  const youtubeUrl = normalizeExternalUrl(metadata.youtubeUrl);
  const hasYoutubeUrl = isValidExternalUrl(youtubeUrl);

  youtubeButton.classList.toggle("disabled", !hasYoutubeUrl);
  youtubeButton.toggleAttribute("href", hasYoutubeUrl);
  youtubeButton.setAttribute("aria-disabled", String(!hasYoutubeUrl));
  youtubeButton.dataset.url = hasYoutubeUrl ? youtubeUrl : "";
  youtubeButton.target = hasYoutubeUrl ? "_blank" : "";
  youtubeButton.rel = hasYoutubeUrl ? "noopener noreferrer" : "";
  if (hasYoutubeUrl) {
    youtubeButton.href = youtubeUrl;
  }
  youtubeButton.title = hasYoutubeUrl ? "YouTube에서 열기" : "YouTube 링크 없음";
  youtubeButton.setAttribute("aria-label", hasYoutubeUrl ? `${currentSong.title} YouTube 링크 열기` : "YouTube 링크 없음");
}

function parseMetadata(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const youtubeMatch = text.match(/"youtubeUrl"\s*:\s*"([^"]+)"/);
    if (youtubeMatch) {
      return { youtubeUrl: youtubeMatch[1] };
    }
    throw error;
  }
}

async function loadSongMetadata(song) {
  updateMetadataUi({});

  try {
    const response = await fetch(getSongMetadataUrl(song), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`metadata ${response.status}`);
    }

    const metadata = parseMetadata(await response.text());
    if (song === currentSong) {
      updateMetadataUi(metadata);
    }
  } catch (error) {
    if (song === currentSong) {
      updateMetadataUi({});
    }
    console.warn(`${song.title} metadata could not be loaded.`, error);
  }
}

function createAudio(track) {
  const audio = new Audio(getSongFileUrl(currentSong, track.file));
  audio.preload = "metadata";
  audio.addEventListener("loadedmetadata", syncDuration);
  audio.addEventListener("ended", handleTrackEnd);
  return audio;
}

function getTrackGroups() {
  const primaryGroups = primaryTrackNames
    .map((name) => {
      const track = tracks.find((item) => item.name === name);
      return track ? { name, tracks: [track] } : null;
    })
    .filter(Boolean);
  const otherTracks = tracks.filter((track) => !primaryTrackNames.includes(track.name));

  if (otherTracks.length > 0) {
    primaryGroups.push({ name: "Others", tracks: otherTracks });
  }

  return primaryGroups;
}

function createMixer(group, index) {
  const node = template.content.firstElementChild.cloneNode(true);
  const enabled = node.querySelector(".track-enabled");
  const name = node.querySelector(".track-name");
  const volume = node.querySelector(".track-volume");
  const volumeValue = node.querySelector(".track-volume-value");
  const soloButton = node.querySelector(".solo-button");

  name.textContent = group.name;
  trackList.append(node);

  const mixer = {
    index,
    name: group.name,
    audios: group.tracks.map(createAudio),
    enabled,
    volume,
    volumeValue,
    soloButton,
    level: 0.5,
  };

  enabled.addEventListener("change", updateVolumes);
  volume.addEventListener("input", () => {
    mixer.level = Number(volume.value) / 100;
    volumeValue.textContent = `${volume.value}%`;
    updateVolumes();
  });
  soloButton.addEventListener("click", () => {
    state.soloTrack = state.soloTrack === index ? null : index;
    updateSoloState();
    updateVolumes();
  });

  return mixer;
}

function renderMixers() {
  trackList.replaceChildren();
  mixers = getTrackGroups().map(createMixer);
}

function resetPlaybackUi() {
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = "0:00";
  seekBar.value = 0;
  loopStartRange.value = 0;
  loopEndRange.value = 1000;
  loopSelection.style.setProperty("--loop-start", "0%");
  loopSelection.style.setProperty("--loop-end", "100%");
  playIcon.textContent = "▶";
  playButton.setAttribute("aria-label", "재생");
  playButton.setAttribute("title", "재생");
}

function stopCurrentSong() {
  mixers.forEach((mixer) => {
    mixer.audios.forEach((audio) => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
  });
  state.isPlaying = false;
}

function resetSongState() {
  state.duration = 0;
  state.playbackTime = 0;
  state.loopStart = 0;
  state.loopEnd = 0;
  state.loopEnabled = false;
  state.soloTrack = null;
  state.seeking = false;
  resetPlaybackUi();
}

function populateSongSelect() {
  songSelect.replaceChildren();
  songLibrary.forEach((song, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = song.title;
    songSelect.append(option);
  });
  songSelect.value = String(state.currentSongIndex);
}

function loadSong(index) {
  const nextSong = songLibrary[index] || songLibrary[0];
  if (!nextSong) {
    return;
  }

  stopCurrentSong();
  state.currentSongIndex = songLibrary.indexOf(nextSong);
  currentSong = nextSong;
  tracks = currentSong.tracks;
  songTitle.textContent = currentSong.title;
  resetSongState();
  renderMixers();
  loadSongMetadata(currentSong);
  updateSoloState();
  updateVolumes();
  updateLoopLabels();
}

async function loadSongLibrary() {
  try {
    const response = await fetch("songs/manifest.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`manifest ${response.status}`);
    }

    const songs = await response.json();
    if (Array.isArray(songs) && songs.length > 0) {
      songLibrary = songs.filter((song) => song.title && song.folder && Array.isArray(song.tracks));
    }
  } catch (error) {
    console.warn("Song manifest could not be loaded. Using fallback song list.", error);
  }

  if (songLibrary.length === 0) {
    songLibrary = fallbackSongs;
  }

  populateSongSelect();
  loadSong(0);
}

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function syncDuration() {
  const loadedDurations = mixers
    .flatMap((mixer) => mixer.audios.map((audio) => audio.duration))
    .filter((duration) => Number.isFinite(duration));

  state.duration = Math.max(0, ...loadedDurations);
  durationLabel.textContent = formatTime(state.duration);
  if (state.loopEnd === 0) {
    state.loopEnd = state.duration;
    updateLoopLabels();
  }
}

function updateVolumes() {
  mixers.forEach((mixer) => {
    const soloAllowsTrack = state.soloTrack === null || state.soloTrack === mixer.index;
    const enabled = mixer.enabled.checked && soloAllowsTrack;
    mixer.audios.forEach((audio) => {
      audio.muted = !enabled;
      audio.volume = enabled ? mixer.level * state.masterVolume : 0;
    });
  });
}

function updateSoloState() {
  mixers.forEach((mixer) => {
    mixer.soloButton.classList.toggle("active", state.soloTrack === mixer.index);
    mixer.soloButton.setAttribute("aria-pressed", String(state.soloTrack === mixer.index));
  });
}

function isLoadedTrack(mixer) {
  return mixer.audios.some((audio) => Number.isFinite(audio.duration) && audio.readyState >= HTMLMediaElement.HAVE_METADATA);
}

function getMixerCurrentTime(mixer) {
  const currentTimes = mixer.audios.map((audio) => audio.currentTime).filter((time) => Number.isFinite(time));
  return Math.max(0, ...currentTimes);
}

function getLeadTrack() {
  const preferredNames = ["Drums", "Percussion", "Bass"];
  return (
    preferredNames
      .map((name) => mixers.find((mixer) => mixer.name === name && isLoadedTrack(mixer)))
      .find(Boolean) ||
    mixers.find(isLoadedTrack) ||
    mixers[0]
  );
}

function getCurrentPlaybackTime() {
  const leadTrack = getLeadTrack();
  if (leadTrack) {
    return getMixerCurrentTime(leadTrack);
  }

  const currentTimes = mixers.flatMap((mixer) => mixer.audios.map((audio) => audio.currentTime)).filter((time) => Number.isFinite(time));
  return Math.max(0, ...currentTimes);
}

function syncTrackTimes(targetTime) {
  state.playbackTime = Math.min(Math.max(targetTime, 0), state.duration || targetTime);

  mixers.forEach((mixer) => {
    mixer.audios.forEach((audio) => {
      if (Number.isFinite(audio.duration) && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        audio.currentTime = Math.min(state.playbackTime, audio.duration);
      }
    });
  });
}

function updateLoopLabels() {
  loopStartValue.textContent = `A ${formatTime(state.loopStart)}`;
  loopEndValue.textContent = `B ${formatTime(state.loopEnd)}`;
  if (state.duration > 0) {
    loopStartRange.value = Math.round((state.loopStart / state.duration) * 1000);
    loopEndRange.value = Math.round((state.loopEnd / state.duration) * 1000);
    loopSelection.style.setProperty("--loop-start", `${loopStartRange.value / 10}%`);
    loopSelection.style.setProperty("--loop-end", `${loopEndRange.value / 10}%`);
  }
  loopToggleButton.classList.toggle("active", state.loopEnabled);
  loopToggleButton.setAttribute("aria-pressed", String(state.loopEnabled));
  loopToggleButton.textContent = state.loopEnabled ? "반복 끄기" : "반복 켜기";
}

function normalizeLoopRange() {
  if (state.loopEnd <= state.loopStart) {
    state.loopEnd = Math.min(state.duration, state.loopStart + 1);
  }
}

function rangeValueToTime(range) {
  return (Number(range.value) / 1000) * state.duration;
}

async function playAll() {
  const resumeTime = state.playbackTime >= state.duration && state.duration > 0 ? 0 : state.playbackTime;
  syncTrackTimes(resumeTime);
  updateVolumes();

  try {
    await Promise.all(mixers.flatMap((mixer) => mixer.audios.map((audio) => audio.play())));
    syncTrackTimes(resumeTime);
    state.isPlaying = true;
    playIcon.textContent = "⏸";
    playButton.setAttribute("aria-label", "일시정지");
    playButton.setAttribute("title", "일시정지");
  } catch (error) {
    state.isPlaying = false;
    pauseAll();
    console.error("Audio playback failed", error);
  }
}

function pauseAll() {
  state.playbackTime = getCurrentPlaybackTime();
  mixers.forEach((mixer) => {
    mixer.audios.forEach((audio) => audio.pause());
  });
  state.isPlaying = false;
  playIcon.textContent = "▶";
  playButton.setAttribute("aria-label", "재생");
  playButton.setAttribute("title", "재생");
}

function handleTrackEnd() {
  const activeAudios = mixers.flatMap((mixer) => mixer.audios).filter((audio) => !audio.paused);
  if (activeAudios.length === 0) {
    pauseAll();
  }
}

function renderProgress() {
  if (!state.seeking) {
    state.playbackTime = state.isPlaying ? getCurrentPlaybackTime() : state.playbackTime;
    if (state.loopEnabled && state.loopEnd > state.loopStart && state.playbackTime >= state.loopEnd) {
      syncTrackTimes(state.loopStart);
    }
    currentTimeLabel.textContent = formatTime(state.playbackTime);
    seekBar.value = state.duration > 0 ? Math.round((state.playbackTime / state.duration) * 1000) : 0;
  }

  requestAnimationFrame(renderProgress);
}

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!metronome.audioContext) {
    metronome.audioContext = new AudioContext();
  }
  return metronome.audioContext;
}

function getBpm() {
  const value = Number(bpmInput.value);
  return Math.min(240, Math.max(40, Number.isFinite(value) ? value : 120));
}

function getMetronomeOffset() {
  return metronome.offsetSeconds;
}

function setMetronomeOffset(offsetMs) {
  const clampedMs = Math.min(1000, Math.max(-1000, offsetMs));
  metronome.offsetSeconds = clampedMs / 1000;
  metronomeOffsetValue.textContent = `${clampedMs}ms`;

  if (metronome.isRunning) {
    metronome.nextBeatTime = getAudioContext().currentTime + 0.04;
    metronome.beat = 0;
  }
}

function nudgeMetronomeOffset(deltaMs) {
  setMetronomeOffset(Math.round(getMetronomeOffset() * 1000) + deltaMs);
}

function getRhythmTrack() {
  return (
    tracks.find((track) => track.name === "Drums") ||
    tracks.find((track) => track.name === "Percussion") ||
    tracks.find((track) => track.name === "Bass") ||
    tracks[0]
  );
}

function getMonoEnvelope(audioBuffer) {
  const frameSize = 1024;
  const hopSize = 512;
  const frameCount = Math.floor((audioBuffer.length - frameSize) / hopSize);
  const envelope = new Float32Array(Math.max(0, frameCount));
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sum = 0;

    for (let i = 0; i < frameSize; i += 1) {
      let sample = 0;
      for (const channel of channels) {
        sample += channel[start + i];
      }
      sample /= channels.length;
      sum += sample * sample;
    }

    envelope[frame] = Math.sqrt(sum / frameSize);
  }

  return { envelope, frameRate: audioBuffer.sampleRate / hopSize };
}

function getOnsetFlux(envelope) {
  const flux = new Float32Array(envelope.length);
  let maxFlux = 0;

  for (let i = 1; i < envelope.length; i += 1) {
    const value = Math.max(0, envelope[i] - envelope[i - 1]);
    flux[i] = value;
    maxFlux = Math.max(maxFlux, value);
  }

  if (maxFlux > 0) {
    for (let i = 0; i < flux.length; i += 1) {
      flux[i] /= maxFlux;
    }
  }

  return flux;
}

function estimateBpm(audioBuffer) {
  const { envelope, frameRate } = getMonoEnvelope(audioBuffer);
  const flux = getOnsetFlux(envelope);
  let bestBpm = 120;
  let bestScore = 0;

  for (let bpm = 40; bpm <= 240; bpm += 1) {
    const lag = Math.round((60 / bpm) * frameRate);
    let score = 0;

    for (let i = lag; i < flux.length; i += 1) {
      score += flux[i] * flux[i - lag];
    }

    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  return bestBpm;
}

function decodeAudioData(context, data) {
  return new Promise((resolve, reject) => {
    const buffer = data.slice(0);
    const promise = context.decodeAudioData(buffer, resolve, reject);

    if (promise && typeof promise.then === "function") {
      promise.then(resolve).catch(reject);
    }
  });
}

async function detectBpm() {
  const track = getRhythmTrack();
  const context = getAudioContext();

  detectBpmButton.disabled = true;
  bpmStatus.textContent = `${track.name} 분석 중`;

  try {
    if (window.location.protocol === "file:") {
      throw new Error("BPM 분석은 로컬 서버에서 실행해야 합니다.");
    }

    const url = new URL(getSongFileUrl(currentSong, track.file), window.location.href);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MP3 파일을 읽지 못했습니다. (${response.status})`);
    }

    const data = await response.arrayBuffer();
    const audioBuffer = await decodeAudioData(context, data);
    const detectedBpm = estimateBpm(audioBuffer);

    bpmInput.value = detectedBpm;
    if (metronome.isRunning) {
      metronome.nextBeatTime = context.currentTime + 0.04;
      metronome.beat = 0;
    }
    bpmStatus.textContent = `${track.name} 기준 ${detectedBpm} BPM`;
  } catch (error) {
    console.error("BPM detection failed", error);
    bpmStatus.textContent = error.message || "분석 실패";
  } finally {
    detectBpmButton.disabled = false;
  }
}

function scheduleClick(time, isAccent) {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const clickLength = isAccent ? 0.055 : 0.04;
  const frequency = isAccent ? 1320 : 920;

  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.type = "square";
  gain.gain.setValueAtTime(metronome.volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + clickLength);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + clickLength);
}

function scheduleMetronome() {
  const context = getAudioContext();
  const lookAhead = 0.12;

  while (metronome.nextBeatTime < context.currentTime + lookAhead) {
    const clickTime = metronome.nextBeatTime + metronome.offsetSeconds;
    if (clickTime >= context.currentTime) {
      scheduleClick(clickTime, metronome.beat % 4 === 0);
    }
    metronome.beat += 1;
    metronome.nextBeatTime += 60 / getBpm();
  }
}

async function startMetronome() {
  const context = getAudioContext();
  if (context.state === "suspended") {
    await context.resume();
  }

  metronome.isRunning = true;
  metronome.beat = 0;
  metronome.nextBeatTime = context.currentTime + 0.04;
  metronome.timer = window.setInterval(scheduleMetronome, 25);
  metronomeToggle.textContent = "끄기";
  metronomeToggle.setAttribute("aria-pressed", "true");
}

function stopMetronome() {
  window.clearInterval(metronome.timer);
  metronome.timer = null;
  metronome.isRunning = false;
  metronomeToggle.textContent = "켜기";
  metronomeToggle.setAttribute("aria-pressed", "false");
}

playButton.addEventListener("click", () => {
  if (state.isPlaying) {
    pauseAll();
  } else {
    playAll();
  }
});

songSelect.addEventListener("change", () => {
  loadSong(Number(songSelect.value));
});

rewindButton.addEventListener("click", () => {
  syncTrackTimes(0);
  currentTimeLabel.textContent = "0:00";
  seekBar.value = 0;
});

seekBar.addEventListener("pointerdown", () => {
  state.seeking = true;
});

seekBar.addEventListener("input", () => {
  const targetTime = (Number(seekBar.value) / 1000) * state.duration;
  currentTimeLabel.textContent = formatTime(targetTime);
});

seekBar.addEventListener("change", () => {
  const targetTime = (Number(seekBar.value) / 1000) * state.duration;
  syncTrackTimes(targetTime);
  currentTimeLabel.textContent = formatTime(state.playbackTime);
  state.seeking = false;
});

loopStartRange.addEventListener("input", () => {
  state.loopStart = Math.min(rangeValueToTime(loopStartRange), Math.max(0, state.loopEnd - 1));
  normalizeLoopRange();
  updateLoopLabels();
});

loopEndRange.addEventListener("input", () => {
  state.loopEnd = Math.min(Math.max(rangeValueToTime(loopEndRange), state.loopStart + 1), state.duration);
  updateLoopLabels();
});

loopToggleButton.addEventListener("click", () => {
  normalizeLoopRange();
  state.loopEnabled = !state.loopEnabled;
  updateLoopLabels();
});

masterVolume.addEventListener("input", () => {
  state.masterVolume = Number(masterVolume.value) / 100;
  masterVolumeValue.textContent = `${masterVolume.value}%`;
  updateVolumes();
});

allOnButton.addEventListener("click", () => {
  mixers.forEach((mixer) => {
    mixer.enabled.checked = true;
  });
  updateVolumes();
});

soloResetButton.addEventListener("click", () => {
  state.soloTrack = null;
  updateSoloState();
  updateVolumes();
});

metronomeToggle.addEventListener("click", () => {
  if (metronome.isRunning) {
    stopMetronome();
  } else {
    startMetronome();
  }
});

bpmInput.addEventListener("change", () => {
  bpmInput.value = getBpm();
});

offsetDown10Button.addEventListener("click", () => {
  nudgeMetronomeOffset(-10);
});

offsetDown1Button.addEventListener("click", () => {
  nudgeMetronomeOffset(-1);
});

offsetUp1Button.addEventListener("click", () => {
  nudgeMetronomeOffset(1);
});

offsetUp10Button.addEventListener("click", () => {
  nudgeMetronomeOffset(10);
});

detectBpmButton.addEventListener("click", detectBpm);

metronomeVolume.addEventListener("input", () => {
  metronome.volume = Number(metronomeVolume.value) / 100;
  metronomeVolumeValue.textContent = `${metronomeVolume.value}%`;
});

loadSongLibrary();
renderProgress();
