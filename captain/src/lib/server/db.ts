import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data.db');

export interface Song {
  shortname: string;
  user: string;
  base64: string;
}

export function initDbIfRequired(): Promise<void> {
  const initStatements = [
    `CREATE TABLE IF NOT EXISTS songs (shortname TEXT NOT NULL PRIMARY KEY, user TEXT NOT NULL, base64 TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS points (username TEXT NOT NULL PRIMARY KEY, points INT)`,
    `CREATE TABLE IF NOT EXISTS bitboosts (username TEXT NOT NULL PRIMARY KEY, amount INT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS subtiers (username TEXT NOT NULL PRIMARY KEY, tier INT NOT NULL)`
  ];
  return new Promise((resolve, reject) => {
    let completed = 0;
    let hadError = false;
    for (const sql of initStatements) {
      db.run(sql, (e: Error | null) => {
        if (e) {
          console.warn('database init error', e);
          hadError = true;
        }
        completed++;
        if (completed === initStatements.length) {
          if (hadError) {
            reject(new Error('Database initialization had errors'));
          } else {
            console.log('Database initialized.');
            resolve();
          }
        }
      });
    }
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

export async function addBitBoost(user: string, amount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO bitboosts (username, amount) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET amount = amount + excluded.amount',
      [user, amount],
      (e: Error | null) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve();
      }
    );
  });
}

export async function getBitBoost(user: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT amount FROM bitboosts WHERE username = ?',
      [user],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve((result.at(0) as { amount: number })?.amount ?? 0);
      }
    );
  });
}

export async function clearBitBoosts(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM bitboosts', (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      console.log('All bit boosts cleared.');
      resolve();
    });
  });
}

export async function setSubTier(user: string, tier: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO subtiers VALUES (?, ?)', [user, tier], (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      resolve();
    });
  });
}

export async function getSubTier(user: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT tier FROM subtiers WHERE username = ?',
      [user],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve((result.at(0) as { tier: number })?.tier ?? 0);
      }
    );
  });
}
