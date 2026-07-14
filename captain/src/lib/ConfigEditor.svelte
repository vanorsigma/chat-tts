<script lang="ts">
  import type { FieldSchema } from '$lib/config/schema';

  export let schema: FieldSchema[];
  export let data: Record<string, unknown>;

  let showSecrets = false;

  function getNested(data: Record<string, unknown>, key: string): unknown {
    return data[key];
  }

  function setNested(data: Record<string, unknown>, key: string, value: unknown) {
    data[key] = value;
    data = data;
  }

  function addListItem(arrKey: string, defaultItem: unknown) {
    const arr = (data[arrKey] as unknown[]) ?? [];
    data[arrKey] = [...arr, defaultItem];
    data = data;
  }

  function removeListItem(arrKey: string, index: number) {
    const arr = (data[arrKey] as unknown[]) ?? [];
    data[arrKey] = [...arr.slice(0, index), ...arr.slice(index + 1)];
    data = data;
  }

  function enableOptional(key: string) {
    data[key] = {};
    data = data;
  }

  function disableOptional(key: string) {
    delete data[key];
    data = data;
  }

  function defaultForListObject(fields: FieldSchema[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      obj[f.key] = f.default ?? '';
    }
    return obj;
  }
</script>

<div class="config-editor">
  <div class="secrets-toggle">
    <label class="bool-label">
      <input type="checkbox" bind:checked={showSecrets} />
      Show secrets
    </label>
  </div>
  {#each schema as field}
    <div class="field">
      {#if field.kind === 'object'}
        <fieldset>
          <legend>{field.label}</legend>
          {#each field.objectFields ?? [] as child}
            <label>
              {child.label}
              <input
                type={child.kind === 'number' ? 'number' : 'text'}
                min={child.min}
                max={child.max}
                step={child.step}
                placeholder={child.placeholder}
                value={getNested(data, field.key)
                  ? ((getNested(data, field.key) as Record)[child.key] ?? '')
                  : ''}
                on:input={(e) => {
                  const obj = {
                    ...((getNested(data, field.key) as Record) ?? {})
                  };
                  obj[child.key] =
                    child.kind === 'number'
                      ? parseFloat(e.currentTarget.value)
                      : e.currentTarget.value;
                  setNested(data, field.key, obj);
                }}
              />
            </label>
          {/each}
        </fieldset>
      {:else if field.kind === 'optional-object'}
        <div class="optional-header">
          <label>
            <input
              type="checkbox"
              checked={data[field.key] !== undefined}
              on:change={(e) => {
                if (e.currentTarget.checked) {
                  enableOptional(field.key);
                } else {
                  disableOptional(field.key);
                }
              }}
            />
            {field.label}
            {field.required ? '(required)' : ''}
          </label>
        </div>
        {#if data[field.key] && field.objectFields}
          <div class="nested-fields">
            {#each field.objectFields as child}
              {#if child.kind === 'list-of-text'}
                <fieldset class="list-field">
                  <legend>{child.label}</legend>
                  {#each ((data[field.key] as Record)[child.key] as string[] | undefined) ?? [] as item, i}
                    <div class="list-row">
                      <input
                        type="text"
                        placeholder={child.placeholder}
                        value={item}
                        on:input={(e) => {
                          const parent = data[field.key] as Record;
                          const arr = [...((parent[child.key] as string[]) ?? [])];
                          arr[i] = e.currentTarget.value;
                          parent[child.key] = arr;
                          data[field.key] = parent;
                          data = data;
                        }}
                      />
                      <button
                        type="button"
                        class="remove-btn"
                        on:click={() => {
                          const parent = data[field.key] as Record;
                          const arr = [...((parent[child.key] as string[]) ?? [])];
                          parent[child.key] = [...arr.slice(0, i), ...arr.slice(i + 1)];
                          data[field.key] = parent;
                          data = data;
                        }}>×</button
                      >
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="add-btn"
                    on:click={() => {
                      const parent = data[field.key] as Record;
                      const arr = [...((parent[child.key] as string[]) ?? [])];
                      parent[child.key] = [...arr, ''];
                      data[field.key] = parent;
                      data = data;
                    }}>+ Add</button
                  >
                </fieldset>
              {:else if child.kind === 'list-of-objects'}
                <fieldset class="list-field">
                  <legend>{child.label}</legend>
                  {#each ((data[field.key] as Record)[child.key] as Record[] | undefined) ?? [] as item, i}
                    <div class="list-object-row">
                      {#each child.listObjectFields ?? [] as subField}
                        <label>
                          {subField.label}
                          <input
                            type={subField.kind === 'number' ? 'number' : 'text'}
                            min={subField.min}
                            max={subField.max}
                            step={subField.step}
                            placeholder={subField.placeholder}
                            value={(item[subField.key] as string | number) ?? ''}
                            on:input={(e) => {
                              const parent = data[field.key] as Record;
                              const arr = [...((parent[child.key] as Record[]) ?? [])];
                              arr[i] = {
                                ...arr[i],
                                [subField.key]:
                                  subField.kind === 'number'
                                    ? parseFloat(e.currentTarget.value)
                                    : e.currentTarget.value
                              };
                              parent[child.key] = arr;
                              data[field.key] = parent;
                              data = data;
                            }}
                          />
                        </label>
                      {/each}
                      <button
                        type="button"
                        class="remove-btn"
                        on:click={() => {
                          const parent = data[field.key] as Record;
                          const arr = [...((parent[child.key] as Record[]) ?? [])];
                          parent[child.key] = [...arr.slice(0, i), ...arr.slice(i + 1)];
                          data[field.key] = parent;
                          data = data;
                        }}>×</button
                      >
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="add-btn"
                    on:click={() => {
                      const parent = data[field.key] as Record;
                      const arr = [...((parent[child.key] as Record[]) ?? [])];
                      const defaultObj: Record = {};
                      for (const f of child.listObjectFields ?? []) {
                        defaultObj[f.key] = f.default ?? '';
                      }
                      parent[child.key] = [...arr, defaultObj];
                      data[field.key] = parent;
                      data = data;
                    }}>+ Add</button
                  >
                </fieldset>
              {:else if child.kind === 'number'}
                <label>
                  {child.label}
                  <input
                    type="number"
                    min={child.min}
                    max={child.max}
                    step={child.step}
                    placeholder={child.placeholder}
                    value={((data[field.key] as Record)[child.key] as number) ?? ''}
                    on:input={(e) => {
                      const parent = data[field.key] as Record;
                      parent[child.key] = parseFloat(e.currentTarget.value);
                      data[field.key] = parent;
                      data = data;
                    }}
                  />
                </label>
              {:else if child.kind === 'boolean'}
                <label class="bool-label">
                  <input
                    type="checkbox"
                    checked={!!(data[field.key] as Record)[child.key]}
                    on:change={(e) => {
                      const parent = data[field.key] as Record;
                      parent[child.key] = e.currentTarget.checked;
                      data[field.key] = parent;
                      data = data;
                    }}
                  />
                  {child.label}
                </label>
              {:else if child.kind === 'secret'}
                <label>
                  {child.label}
                  {child.required ? '*' : ''}
                  <div class="secret-row">
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      placeholder={child.placeholder}
                      value={((data[field.key] as Record)[child.key] as string) ?? ''}
                      on:input={(e) => {
                        const parent = data[field.key] as Record;
                        parent[child.key] = e.currentTarget.value;
                        data[field.key] = parent;
                        data = data;
                      }}
                    />
                  </div>
                </label>
              {:else}
                <label>
                  {child.label}
                  {child.required ? '*' : ''}
                  <input
                    type="text"
                    placeholder={child.placeholder}
                    value={((data[field.key] as Record)[child.key] as string) ?? ''}
                    on:input={(e) => {
                      const parent = data[field.key] as Record;
                      parent[child.key] = e.currentTarget.value;
                      data[field.key] = parent;
                      data = data;
                    }}
                  />
                </label>
              {/if}
            {/each}
          </div>
        {/if}
      {:else if field.kind === 'list-of-text'}
        <fieldset class="list-field">
          <legend>{field.label}</legend>
          {#each (data[field.key] as string[] | undefined) ?? [] as item, i}
            <div class="list-row">
              <input
                type="text"
                placeholder={field.placeholder}
                value={item}
                on:input={(e) => {
                  const arr = [...((data[field.key] as string[]) ?? [])];
                  arr[i] = e.currentTarget.value;
                  setNested(data, field.key, arr);
                }}
              />
              <button type="button" class="remove-btn" on:click={() => removeListItem(field.key, i)}
                >×</button
              >
            </div>
          {/each}
          <button type="button" class="add-btn" on:click={() => addListItem(field.key, '')}
            >+ Add</button
          >
        </fieldset>
      {:else if field.kind === 'list-of-objects'}
        <fieldset class="list-field">
          <legend>{field.label}</legend>
          {#each (data[field.key] as Record[] | undefined) ?? [] as item, i}
            <div class="list-object-row">
              {#each field.listObjectFields ?? [] as child}
                <label>
                  {child.label}
                  <input
                    type="text"
                    placeholder={child.placeholder}
                    value={(item[child.key] as string) ?? ''}
                    on:input={(e) => {
                      const arr = [...((data[field.key] as Record[]) ?? [])];
                      arr[i] = { ...arr[i], [child.key]: e.currentTarget.value };
                      setNested(data, field.key, arr);
                    }}
                  />
                </label>
              {/each}
              <button type="button" class="remove-btn" on:click={() => removeListItem(field.key, i)}
                >×</button
              >
            </div>
          {/each}
          <button
            type="button"
            class="add-btn"
            on:click={() =>
              addListItem(field.key, defaultForListObject(field.listObjectFields ?? []))}
          >
            + Add
          </button>
        </fieldset>
      {:else if field.kind === 'number'}
        <label>
          {field.label}
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            value={data[field.key] as number}
            on:input={(e) => setNested(data, field.key, parseFloat(e.currentTarget.value))}
          />
        </label>
      {:else if field.kind === 'boolean'}
        <label class="bool-label">
          <input
            type="checkbox"
            checked={!!data[field.key]}
            on:change={(e) => setNested(data, field.key, e.currentTarget.checked)}
          />
          {field.label}
        </label>
      {:else if field.kind === 'secret'}
        <label>
          {field.label}
          {field.required ? '*' : ''}
          <input
            type={showSecrets ? 'text' : 'password'}
            placeholder={field.placeholder}
            value={(data[field.key] as string) ?? ''}
            on:input={(e) => setNested(data, field.key, e.currentTarget.value)}
          />
        </label>
      {:else}
        <label>
          {field.label}
          {field.required ? '*' : ''}
          <input
            type="text"
            placeholder={field.placeholder}
            value={(data[field.key] as string) ?? ''}
            on:input={(e) => setNested(data, field.key, e.currentTarget.value)}
          />
        </label>
      {/if}
    </div>
  {/each}
</div>

<style>
  .config-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .secrets-toggle {
    margin-bottom: 0.3em;
  }

  .secret-row {
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  fieldset {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.5em;
  }

  fieldset.list-field {
    border: 1px solid #ccc;
  }

  legend {
    font-weight: bold;
    padding: 0 0.3em;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2em;
    font-size: 0.9em;
    color: #333;
  }

  .bool-label {
    flex-direction: row;
    align-items: center;
    gap: 0.3em;
  }

  input[type='text'],
  input[type='number'] {
    padding: 4px;
    border: 1px solid #ccc;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .list-row {
    display: flex;
    gap: 0.3em;
    margin-bottom: 0.2em;
  }

  .list-row input {
    flex: 1;
  }

  .list-object-row {
    position: relative;
    margin-bottom: 0.3em;
    padding: 0.3em;
    border: 1px dashed #ddd;
    border-radius: 3px;
  }

  .remove-btn {
    background: #e44;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 0.9em;
    line-height: 1;
  }

  .add-btn {
    background: #4a4;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    padding: 2px 8px;
    font-size: 0.85em;
    margin-top: 0.2em;
    align-self: flex-start;
  }

  .optional-header {
    margin-bottom: 0.3em;
  }

  .optional-header label {
    flex-direction: row;
    align-items: center;
    gap: 0.3em;
  }

  .nested-fields {
    padding-left: 1em;
    border-left: 2px solid #ddd;
    display: flex;
    flex-direction: column;
    gap: 0.3em;
  }
</style>
