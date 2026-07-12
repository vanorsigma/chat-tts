import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data.db');

export interface Song {
  shortname: string;
  user: string;
  base64: string;
}

export function initDbIfRequired(): Promise<void> {
  const initStatement = `
    CREATE TABLE songs (shortname TEXT NOT NULL PRIMARY KEY, user TEXT NOT NULL, base64 TEXT NOT NULL);
    CREATE TABLE points (username TEXT NOT NULL PRIMARY KEY, points INT);
  `;
  return new Promise((resolve, reject) => {
    db.run(
      initStatement,
      (_, e) => {
        if (e) {
          reject(e);
          return;
        }
        resolve();
      }
    );
  });
}

export async function setPointsForUser(user: string, points: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO points VALUES (?, ?)', [user, points], (e) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      resolve();
    });
  });
}

export async function getPointsForUser(user: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all('SELECT points FROM points WHERE username = ?', [user], (e, result) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      resolve((result.at(0) as { points: number })?.points ?? 0 as number);
    });
  });
}

export function saveSong(shortname: string, user: string, base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO songs VALUES (?, ?, ?)', [shortname, user, base64], (e) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      resolve();
    });
  });
}

export function getSong(shortname: string): Promise<Song> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT shortname, user, base64 from songs WHERE shortname = ?',
      [shortname],
      (e, result) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }

        resolve(result[0] as Song);
      }
    );
  });
}

export async function listSongs(): Promise<Song[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT shortname, user, base64 from songs', [], (e, result) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      resolve(result as Song[]);
    });
  });
}

export async function deleteSong(shortname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM songs WHERE shortname = ?', [shortname], (e) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      resolve();
    });
  });
}
