// Web Speech API Text-to-Speech (TTS) helper

export function getSelectedVoiceURI(): string {
  if (typeof window === "undefined" || !localStorage) return "";
  return localStorage.getItem("flashcard_selected_voice") || "";
}

export function setSelectedVoiceURI(uri: string) {
  if (typeof window === "undefined" || !localStorage) return;
  localStorage.setItem("flashcard_selected_voice", uri);
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  
  // Cancel any active speech first to avoid overlapping
  window.speechSynthesis.cancel();
  
  // Create SpeechUtterance
  const utterance = new SpeechSynthesisUtterance(text);
  const selectedUri = getSelectedVoiceURI();
  
  const voices = window.speechSynthesis.getVoices();
  
  if (selectedUri) {
    const voice = voices.find(v => v.voiceURI === selectedUri);
    if (voice) {
      utterance.voice = voice;
    }
  } else {
    // If no voice is saved, fallback to the first English/preferred language voice
    const englishVoice = voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
  }
  
  // Extra settings for a natural and clear sound
  utterance.rate = 0.95; // Slightly slower for language learners
  utterance.pitch = 1.0;
  
  window.speechSynthesis.speak(utterance);
}
