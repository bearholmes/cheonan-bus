// Simple Web Audio API Synthesizer for Cheonan Bus

let ctx = null
let masterGain = null
let engineOsc = null
let engineGain = null
let brakeNoise = null
let brakeGain = null
let bgmOsc1 = null
let bgmOsc2 = null
let bgmGain = null

// Musical scale for BGM (Pentatonic)
const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]
let bgmStep = 0
let bgmTimer = null

export function initAudio() {
    if (!ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (!AudioContext) return // Not supported
        ctx = new AudioContext()

        masterGain = ctx.createGain()
        masterGain.gain.value = 0.5
        masterGain.connect(ctx.destination)

        // Engine setup
        engineOsc = ctx.createOscillator()
        engineOsc.type = 'sawtooth'
        engineGain = ctx.createGain()
        engineGain.gain.value = 0
        engineOsc.connect(engineGain)
        engineGain.connect(masterGain)
        engineOsc.start()

        // Brake setup (noise)
        const bufferSize = ctx.sampleRate * 2 // 2 seconds
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1
        }
        brakeNoise = ctx.createBufferSource()
        brakeNoise.buffer = buffer
        brakeNoise.loop = true

        // Filter for brake noise
        const filter = ctx.createBiquadFilter()
        filter.type = 'highpass'
        filter.frequency.value = 4000
        brakeNoise.connect(filter)

        brakeGain = ctx.createGain()
        brakeGain.gain.value = 0
        filter.connect(brakeGain)
        brakeGain.connect(masterGain)
        brakeNoise.start()

        // BGM Setup
        bgmGain = ctx.createGain()
        bgmGain.gain.value = 0.1
        bgmGain.connect(masterGain)
        startBgm()
    }

    if (ctx.state === 'suspended') {
        ctx.resume()
    }
}

function startBgm() {
    if (bgmTimer) return

    const playNote = () => {
        if (!ctx || ctx.state !== 'running') {
            bgmTimer = setTimeout(playNote, 500)
            return
        }

        const time = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        // A simple relaxing pentatonic sequence
        const noteSequence = [0, 2, 4, 2, 3, 1, 0, 5]
        const note = notes[noteSequence[bgmStep % noteSequence.length]]

        // Add some random variation
        osc.frequency.setValueAtTime(note / 2, time) // Lower octave for relaxing vibe

        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(0.3, time + 0.1)
        gain.gain.exponentialRampToValueAtTime(0.01, time + 1.0)

        osc.connect(gain)
        gain.connect(bgmGain)

        osc.start(time)
        osc.stop(time + 1.2)

        bgmStep++
        bgmTimer = setTimeout(playNote, 800) // 800ms per note
    }

    playNote()
}

export function updateEngine(speed, maxSpeed, isBraking) {
    if (!ctx || ctx.state !== 'running' || !engineOsc) return

    const speedR = Math.max(0, Math.min(1, Math.abs(speed) / maxSpeed))

    // Base idle: 45Hz, Max RPM: 150Hz
    const targetFreq = 45 + speedR * 105
    engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.1)

    // Volume based on speed (idle is quiet)
    const targetGain = 0.1 + speedR * 0.15
    engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1)

    // Brake noise
    if (isBraking && Math.abs(speed) > 1) {
        brakeGain.gain.setTargetAtTime(0.15, ctx.currentTime, 0.05)
    } else {
        brakeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
    }
}

export function playDoor(isOpen) {
    if (!ctx || ctx.state !== 'running') return

    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    if (isOpen) {
        osc.frequency.setValueAtTime(400, t)
        osc.frequency.linearRampToValueAtTime(800, t + 0.5)
    } else {
        osc.frequency.setValueAtTime(800, t)
        osc.frequency.linearRampToValueAtTime(400, t + 0.5)
    }

    // Pneumatic hiss simulation
    const hiss = ctx.createBufferSource()
    hiss.buffer = brakeNoise.buffer
    const hissFilter = ctx.createBiquadFilter()
    hissFilter.type = 'bandpass'
    hissFilter.frequency.value = 2000
    hiss.connect(hissFilter)

    const hissGain = ctx.createGain()
    hissFilter.connect(hissGain)
    hissGain.connect(masterGain)

    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.2, t + 0.1)
    gain.gain.linearRampToValueAtTime(0, t + 0.5)

    hissGain.gain.setValueAtTime(0, t)
    hissGain.gain.linearRampToValueAtTime(0.1, t + 0.1)
    hissGain.gain.linearRampToValueAtTime(0, t + 0.8)

    osc.connect(gain)
    gain.connect(masterGain)

    osc.start(t)
    osc.stop(t + 0.6)
    hiss.start(t)
    hiss.stop(t + 0.9)
}

function playTone(freq, type, duration, vol = 0.3) {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = type
    osc.frequency.value = freq

    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration)

    osc.connect(gain)
    gain.connect(masterGain)

    osc.start(t)
    osc.stop(t + duration)
}

export function playBoard() {
    playTone(880, 'sine', 0.2, 0.1)    // High beep
    setTimeout(() => playTone(1108, 'sine', 0.3, 0.1), 100)
}

export function playDrop() {
    playTone(659, 'sine', 0.15, 0.1)   // Low beep
    setTimeout(() => playTone(523, 'sine', 0.2, 0.1), 100)
}

export function playScore(quality) {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime

    if (quality === 'perfect') {
        playTone(523.25, 'sine', 0.2, 0.2) // C5
        setTimeout(() => playTone(659.25, 'sine', 0.2, 0.2), 150) // E5
        setTimeout(() => playTone(783.99, 'sine', 0.4, 0.2), 300) // G5
    } else if (quality === 'good') {
        playTone(440.00, 'sine', 0.2, 0.2) // A4
        setTimeout(() => playTone(523.25, 'sine', 0.4, 0.2), 200) // C5
    } else {
        // bad
        playTone(349.23, 'square', 0.5, 0.1) // F4
    }
}

export function playCrash() {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime

    const hiss = ctx.createBufferSource()
    hiss.buffer = brakeNoise.buffer
    const hissFilter = ctx.createBiquadFilter()
    hissFilter.type = 'lowpass'
    hissFilter.frequency.value = 800
    hiss.connect(hissFilter)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.8, t)
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8)

    hissFilter.connect(gain)
    gain.connect(masterGain)
    hiss.start(t)
    hiss.stop(t + 0.9)

    playTone(150, 'sawtooth', 0.5, 0.4)
}

export function playMiss() {
    playTone(200, 'sawtooth', 0.3, 0.2)
    setTimeout(() => playTone(150, 'sawtooth', 0.5, 0.2), 200)
}
