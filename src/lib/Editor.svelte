<script lang="ts">
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, type KeyBinding } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { yaml } from '@codemirror/lang-yaml';
  import { onMount } from 'svelte';

  const extensions = [
    yaml(),
    history(),
    lineNumbers(),
    syntaxHighlighting(defaultHighlightStyle),
    keymap.of([defaultKeymap as KeyBinding, historyKeymap as KeyBinding]),
    EditorView.updateListener.of((v) => {
      if (v.docChanged) {
        configText = view.state.doc.toString();
      }
    })
  ];

  const state = EditorState.create({ extensions });
  const view = new EditorView({ state });
  let editor: HTMLDivElement | undefined = undefined;

  export let configText = '';

  onMount(() => {
    if (editor) {
      editor.append(view.dom);
    }
  });
</script>

<div bind:this={editor}></div>

<style>
  div {
    border: solid grey;
    border-radius: 0.2em;
  }
</style>
