import { PUBLIC_ATTACHMENTS_URL } from '$env/static/public';

const tagRe = /^{(.*)}$/g;

export function extractTag(argument: string): string | null {
  const matches = Array.from(argument.matchAll(tagRe));
  if (matches.length < 1) return null;
  const match = matches[0][1];
  return String(match);
}

export function getAttachmentUrlForTag(tagname: string): string {
  return `${PUBLIC_ATTACHMENTS_URL}?tag=${tagname}`;
}

export async function isTagExist(tagname: string): Promise<boolean> {
  const response = await fetch(getAttachmentUrlForTag(tagname));
  return response.status === 200;
}

export async function registerTag(tagname: string, url: string) {
  const formData = new FormData();
  formData.append('url', url);
  formData.append('tag', tagname.replace('{', '').replace('}', ''));

  const response = await fetch(PUBLIC_ATTACHMENTS_URL, {
    method: 'POST',
    body: formData
  });

  if (response.status !== 200) {
    const errormsg = await response.text();
    console.error(`Cannot create tag: ${tagname}, msg: ${errormsg}`);
    throw new Error(errormsg);
  }
}
