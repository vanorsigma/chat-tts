#!/bin/bash
# Gets songs from the playlist using yt-dlp. Obviously requires yt-dlp.

if ! command -v yt-dlp &> /dev/null
then
    echo "yt-dlp could not be found. Please install it."
    exit
fi

PROJECT_DIR=""

function get_root_dir {
    local current_dir
    current_dir=$(pwd)
    while [[ $current_dir != "/" ]]; do
        if [[ -f "$current_dir/pyproject.toml" ]]; then
            PROJECT_DIR=$current_dir
            echo "Project Root: $PROJECT_DIR"
            return
        fi
        current_dir=$(dirname "$current_dir")
    done
    echo "Could not find root directory. Are you sure you are in the right directory?"
    exit 1
}

get_root_dir

if [ -z "$PROJECT_DIR" ]; then
    echo "No root directory, quitting now."
    exit 1
fi

set -e

echo -n "Enter the playlist / song URL: "
read PLAYLIST_URL

echo -n "Common regex prefix to strip: "
read PREFIX

echo -n "Common regex suffix to strip: "
read SUFFIX


yt-dlp -x --audio-format m4a -o "%(title)s.%(ext)s" $PLAYLIST_URL
for file in *.m4a; do
    new_name=$(echo "$file" | tr '[:upper:]' '[:lower:]')
    new_name=$(echo "$new_name" | tr ' ' '_')

    if [ -n "$PREFIX" ]; then
        new_name=$(echo "$new_name" | sed "s/^$PREFIX//")
    fi

    if [ -n "$SUFFIX" ]; then
        new_name=$(echo "$new_name" | sed "s/$SUFFIX.m4a\$//")
    fi

    echo "Renaming to $new_name"
    mkdir -p $PROJECT_DIR/src/trinket/resources/songs
    mv "$file" "$PROJECT_DIR/src/trinket/resources/songs/$new_name"
done
