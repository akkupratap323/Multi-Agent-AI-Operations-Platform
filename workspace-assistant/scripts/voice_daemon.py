#!/Users/apple/.openclaw/workspace-assistant/scripts/venv/bin/python3
import speech_recognition as sr
import subprocess
import os

import json
import re

def strip_emojis(text):
    # Strip emojis and strange formatting characters
    return re.sub(r'[^\x00-\x7F]+', '', text).strip()

def speak(text):
    clean_text = strip_emojis(text)
    print(f"Assistant: {clean_text}")
    # Run the say command
    subprocess.run(['say', clean_text])

def query_agent(prompt):
    print(f"Executing: openclaw agent --message '{prompt}' --agent assistant --json")
    try:
        result = subprocess.run(
            ['openclaw', 'agent', '--message', prompt, '--agent', 'assistant', '--json'],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse standard JSON output
        try:
            # We search for the first { ... } if there's any preceding logs
            out_str = result.stdout.strip()
            if not out_str.startswith('{'):
                start_idx = out_str.find('{')
                if start_idx != -1:
                    out_str = out_str[start_idx:]
            
            data = json.loads(out_str)
            payloads = data.get('result', {}).get('payloads', [])
            if payloads and len(payloads) > 0:
                if 'text' in payloads[0] and payloads[0]['text']:
                    return payloads[0]['text']
            return "Done."
        except json.JSONDecodeError:
            return result.stdout.strip()
            
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {e.stderr}")
        return "I'm sorry, I encountered an error running that command."

def listen_loop():
    recognizer = sr.Recognizer()
    microphone = sr.Microphone()

    print("🎙️  Voice daemon started! Say 'Assistant' followed by your command.")
    
    with microphone as source:
        # Calibrate for ambient noise
        recognizer.adjust_for_ambient_noise(source)
    
    while True:
        with microphone as source:
            print("\nListening...")
            try:
                audio = recognizer.listen(source, timeout=None, phrase_time_limit=10)
            except sr.WaitTimeoutError:
                continue

        try:
            text = recognizer.recognize_google(audio).lower()
            print(f"You said: {text}")

            if "assistant" in text:
                # Extract command
                command = text.replace("hey assistant", "").replace("ok assistant", "").replace("assistant", "").strip()
                
                if not command:
                    speak("Yes? I am listening.")
                    continue
                
                # Speak acknowledgement
                print("Thinking...")
                
                # Forward to openclaw
                response = query_agent(command)
                
                # The response from openclaw comes out. E.g "✅ Responded: text". We should say it.
                # Clean up simple artifacts from the CLI if needed
                if response:
                     speak(response)

        except sr.UnknownValueError:
            pass # Ignore unrecognised background noise
        except sr.RequestError as e:
            print(f"Could not request results; {e}")

if __name__ == "__main__":
    listen_loop()
