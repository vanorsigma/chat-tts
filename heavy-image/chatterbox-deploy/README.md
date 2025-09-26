# Chatterbox Deploy

Deployment script for Chatterbox.

The reason why we use a requirements file instead of `uv`, is because `chatterbox-tts` relies on `numpy`, and for some reason doesn't build properly.

Needs a `to_clone.wav`. If sending this to a server, I recommend just sending this folder over rather than cloning the repo.
