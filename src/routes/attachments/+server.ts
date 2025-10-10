import { type RequestHandler } from '@sveltejs/kit';
import { glob, readFile, writeFile } from 'fs/promises';
import { extension, lookup } from 'mime-types';

const whitespaceRegex = /\s/;

async function findMatchingFile(tag: string): Promise<string | null> {
  for await (const entry of glob(`attachments/${tag}.*`)) {
    return entry;
  }
  return null;
}

export const GET: RequestHandler = async ({ request }) => {
  const searchParam = new URLSearchParams(request.url.split('?')[1]);
  const tag = decodeURIComponent(searchParam.get('tag')?.trim() ?? '');
  if (!tag && whitespaceRegex.test(tag)) {
    return new Response('Tag invalid', {
      status: 400
    });
  }

  const fileName = await findMatchingFile(tag);
  if (!fileName) {
    return new Response('not found', {
      status: 404
    });
  }

  const fileData = Buffer.from(await readFile(fileName));
  let contentType = lookup(fileName);
  if (!contentType) contentType = 'text/plain';

  return new Response(fileData, {
    headers: {
      'content-type': contentType,
      'content-length': fileData.length.toString()
    }
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const formData = Object.fromEntries(await request.formData());
  if (!(formData.url as string)) {
    return new Response('You must provide a file to upload', {
      status: 400
    });
  }

  if (!(formData.tag as string)) {
    return new Response('You must provide a tag', {
      status: 400
    });
  }

  const url = decodeURIComponent(formData.url! as string);
  const tag = formData.tag! as string;

  console.log(`Will save attachment ${url} as ${tag}`);

  if (await findMatchingFile(tag)) {
    return new Response('File already exists', {
      status: 400
    });
  }

  const attachmentResponse = await fetch(url);
  if (!attachmentResponse.ok) {
    return new Response('Cannot access file', {
      status: 500
    });
  }

  const ext = extension(attachmentResponse.headers.get('Content-Type') ?? 'text/plain');
  const data = await attachmentResponse.bytes();

  try {
    await writeFile(`attachments/${tag}.${ext}`, data);
  } catch (e: unknown) {
    console.error('Error while saving attachments', e);
    return new Response('File fails to save', {
      status: 500
    });
  }

  return new Response('OK', {
    status: 200
  });
};
