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
    db.run(initStatement, (_: any, e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      console.log('Database initialized.');
      resolve();
    });
  });
}

export async function setPointsForUser(user: string, points: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO points VALUES (?, ?)', [user, points], (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      console.log(`Points set for ${user}: ${points}`);
      resolve();
    });
  });
}

export async function getPointsForUser(user: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT points FROM points WHERE username = ?',
      [user],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }

        const points = (result.at(0) as { points: number })?.points ?? 0;
        console.log(`Points retrieved for ${user}: ${points}`);
        resolve(points);
      }
    );
  });
}

export function saveSong(shortname: string, user: string, base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO songs VALUES (?, ?, ?)', [shortname, user, base64], (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      console.log(`Song saved: ${shortname} by ${user}`);
      resolve();
    });
  });
}

export function getSong(shortname: string): Promise<Song> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT shortname, user, base64 from songs WHERE shortname = ?',
      [shortname],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }

        console.log(`Song retrieved: ${shortname}`);
        resolve(result[0] as Song);
      }
    );
  });
}

export async function listSongs(): Promise<Song[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT shortname, user, base64 from songs', [], (e: Error | null, result: any[]) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      console.log(`Listed ${result.length} songs.`);
      resolve(result as Song[]);
    });
  });
}

export async function deleteSong(shortname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM songs WHERE shortname = ?', [shortname], (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }

      console.log(`Song deleted: ${shortname}`);
      resolve();
    });
  });
}
