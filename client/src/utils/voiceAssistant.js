// Voice & Audio Assistant (Web Speech API)
// Supports Kannada (kn-IN) and English (en-IN / en-US)

export const isSpeechRecognitionSupported = () => {
  return typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);
};

export const createSpeechRecognizer = (lang = 'en') => {
  if (!isSpeechRecognitionSupported()) {
    return null;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new SpeechRecognition();
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.lang = lang === 'kn' ? 'kn-IN' : 'en-IN';
  return recognizer;
};

// Text-to-Speech Read-Back
export const speakText = (text, lang = 'en') => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('Speech synthesis not supported in this browser environment');
    return false;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending utterances
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'kn' ? 'kn-IN' : 'en-IN';
    utterance.rate = 0.95; // slightly slower for maximum clarity
    utterance.pitch = 1.0;

    // Pick best matching voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => v.lang.startsWith(lang === 'kn' ? 'kn' : 'en'));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.error('Speech synthesis error:', err);
    return false;
  }
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
