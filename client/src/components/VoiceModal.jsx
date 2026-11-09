import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Check, X, AlertCircle } from 'lucide-react';
import { createSpeechRecognizer, isSpeechRecognitionSupported, speakText } from '../utils/voiceAssistant';

export default function VoiceModal({ isOpen, onClose, onConfirm, initialText = '', lang = 'en', title = 'Voice Input' }) {
  const [text, setText] = useState(initialText);
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const recognizerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setErrorMsg('');
      if (isSpeechRecognitionSupported()) {
        startListening();
      } else {
        setErrorMsg('Microphone speech recognition is not available in this browser. You can type your text directly below.');
      }
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [isOpen]);

  const startListening = () => {
    setErrorMsg('');
    try {
      const recognizer = createSpeechRecognizer(lang);
      if (!recognizer) {
        setErrorMsg('Speech recognition service could not be initialized.');
        return;
      }

      recognizer.onstart = () => {
        setIsListening(true);
      };

      recognizer.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setText(prev => {
          const base = prev ? prev.trim() + ' ' : '';
          return base + transcript;
        });
      };

      recognizer.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone permission was denied. Please allow microphone access or type manually below.');
        } else if (event.error === 'no-speech') {
          // just silent, no critical error
        } else {
          setErrorMsg(`Voice input status: ${event.error}. You can type manually below.`);
        }
      };

      recognizer.onend = () => {
        setIsListening(false);
      };

      recognizer.start();
      recognizerRef.current = recognizer;
    } catch (err) {
      setErrorMsg('Could not start microphone: ' + err.message);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognizerRef.current) {
      try {
        recognizerRef.current.stop();
      } catch {
        // ignore
      }
      recognizerRef.current = null;
    }
    setIsListening(false);
  };

  const handleReadAloud = () => {
    if (text) {
      speakText(text, lang);
    }
  };

  const handleConfirm = () => {
    stopListening();
    onConfirm(text);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              backgroundColor: isListening ? '#fee2e2' : '#eff6ff',
              color: isListening ? '#ef4444' : '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Mic size={20} className={isListening ? 'listening-pulse' : ''} />
            </div>
            <div>
              <h3 className="modal-title">{title}</h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                {lang === 'kn' ? 'ಭಾಷೆ: ಕನ್ನಡ (Kannada)' : 'Language: English'}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {errorMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', backgroundColor: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: '8px',
              color: '#92400e', fontSize: '13px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', backgroundColor: isListening ? '#fef2f2' : '#f8fafc',
            border: isListening ? '1px solid #fca5a5' : '1px solid #e2e8f0',
            borderRadius: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '50%',
                backgroundColor: isListening ? '#ef4444' : '#94a3b8',
                boxShadow: isListening ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : 'none'
              }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: isListening ? '#991b1b' : '#475569' }}>
                {isListening ? 'Listening... Speak clearly now' : 'Microphone idle'}
              </span>
            </div>

            <button
              className={isListening ? 'btn-danger' : 'btn-primary'}
              style={{ padding: '6px 14px', fontSize: '12px' }}
              onClick={isListening ? stopListening : startListening}
            >
              {isListening ? <><MicOff size={14} /> Stop Listening</> : <><Mic size={14} /> Start Mic</>}
            </button>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Review and Edit Recognized Text:</label>
              {text && (
                <button
                  type="button"
                  onClick={handleReadAloud}
                  style={{
                    background: 'transparent', color: '#2563eb', fontSize: '12px',
                    fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <Volume2 size={14} /> Read Aloud
                </button>
              )}
            </div>
            <textarea
              className="form-control"
              style={{ minHeight: '120px', fontSize: '15px' }}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Your spoken words will appear here. You can also edit or type manually."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleConfirm} disabled={!text.trim()}>
            <Check size={16} /> Use This Text
          </button>
        </div>
      </div>
    </div>
  );
}
