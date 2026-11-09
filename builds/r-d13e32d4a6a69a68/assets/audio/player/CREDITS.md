# Player voice recordings

Original: **Male Grunt/Yelling sounds** by **HaelDB**
Source: https://opengameart.org/content/male-gruntyelling-sounds
Archive: https://opengameart.org/sites/default/files/yelling%20sounds.zip
License chosen: **CC0 1.0 Universal** (one of the licenses offered by the creator)
License: https://creativecommons.org/publicdomain/zero/1.0/
Source and license checked: 2026-10-30.

These are recordings of a human performer. No voice cloning or speech synthesis is used for the player voice.
Selected takes: 3grunt1.wav, 3grunt2.wav, 3grunt3.wav, 3grunt4.wav, 3yell9.wav.
Edits: mono mixdown, DC removal, leading/trailing silence trim, level matching and 6 ms edge fades. Original pitch and speed are preserved.
Processing details and original SHA-256 hashes are in processing.json.

The processed WAV files are provided for editing. The same PCM audio is embedded in js/player-voice-data.js so that opening index.html directly also works offline. If replacing these WAVs, regenerate the embedded data too.
Player and enemy voices use these recordings. Enemy playback adds spatial positioning, distance attenuation, occlusion filtering and the existing fixed per-actor playback-rate/EQ profiles. Those profiles do not represent independent recordings. Trial19 retains them and adds two distinct short enemy takes; see ../enemy19/CREDITS.md. Other game effects still use Web Audio synthesis.
