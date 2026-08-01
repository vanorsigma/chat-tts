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
    `CREATE TABLE IF NOT EXISTS subtiers (username TEXT NOT NULL PRIMARY KEY, tier INT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS stock_holdings (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, stock TEXT NOT NULL, invested_points INTEGER NOT NULL, buy_price REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS idx_stock_holdings_user ON stock_holdings(username)`,
    `CREATE TABLE IF NOT EXISTS lottery_entries (username TEXT NOT NULL PRIMARY KEY, shares INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS lottery_tax (id INTEGER PRIMARY KEY CHECK (id = 1), amount INTEGER NOT NULL DEFAULT 0)`
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

export interface StockHoldingRow {
  id: number;
  username: string;
  stock: string;
  invested_points: number;
  buy_price: number;
  created_at: string;
}

export async function createHolding(
  user: string,
  stock: string,
  invested_points: number,
  buy_price: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO stock_holdings (username, stock, invested_points, buy_price) VALUES (?, ?, ?, ?)',
      [user, stock, invested_points, buy_price],
      function (e: Error | null) {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

export async function getHoldingById(id: number): Promise<StockHoldingRow | null> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, username, stock, invested_points, buy_price, created_at FROM stock_holdings WHERE id = ?',
      [id],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve((result[0] as StockHoldingRow) ?? null);
      }
    );
  });
}

export async function getAllHoldingsForUser(user: string): Promise<StockHoldingRow[]> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, username, stock, invested_points, buy_price, created_at FROM stock_holdings WHERE username = ? ORDER BY created_at',
      [user],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve(result as StockHoldingRow[]);
      }
    );
  });
}

export async function getHoldingsForUserAndStock(
  user: string,
  stock: string
): Promise<StockHoldingRow[]> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, username, stock, invested_points, buy_price, created_at FROM stock_holdings WHERE username = ? AND stock = ? ORDER BY created_at',
      [user, stock],
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve(result as StockHoldingRow[]);
      }
    );
  });
}

export async function deleteHoldingById(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM stock_holdings WHERE id = ?', [id], (e: Error | null) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      resolve();
    });
  });
}

export async function updateHoldingPoints(id: number, newInvestedPoints: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE stock_holdings SET invested_points = ? WHERE id = ?',
      [newInvestedPoints, id],
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

export async function getMedianPointsForUsers(usernames: string[]): Promise<number> {
  if (usernames.length === 0) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    const placeholders = usernames.map(() => '?').join(',');
    db.all(
      `SELECT points FROM points WHERE points > 0 AND username IN (${placeholders}) ORDER BY points`,
      usernames,
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        const vals = (result as Array<{ points: number }>).map((r) => r.points);
        if (vals.length === 0) {
          resolve(0);
          return;
        }
        const mid = Math.floor(vals.length / 2);
        if (vals.length % 2 === 0) {
          resolve((vals[mid - 1] + vals[mid]) / 2);
        } else {
          resolve(vals[mid]);
        }
      }
    );
  });
}

export async function getTotalPoints(): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT COALESCE(SUM(points), 0) as total FROM points',
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        resolve((result[0] as { total: number })?.total ?? 0);
      }
    );
  });
}

export async function getMedianPoints(): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT points FROM points WHERE points > 0 ORDER BY points',
      (e: Error | null, result: any[]) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        const vals = (result as Array<{ points: number }>).map((r) => r.points);
        if (vals.length === 0) {
          resolve(0);
          return;
        }
        const mid = Math.floor(vals.length / 2);
        if (vals.length % 2 === 0) {
          resolve((vals[mid - 1] + vals[mid]) / 2);
        } else {
          resolve(vals[mid]);
        }
      }
    );
  });
}

export async function getLotteryEntries(): Promise<Array<{ username: string; shares: number }>> {
  return new Promise((resolve, reject) => {
    db.all('SELECT username, shares FROM lottery_entries', (e: Error | null, result: any[]) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      resolve(result as Array<{ username: string; shares: number }>);
    });
  });
}

export async function addLotteryEntry(username: string, shares: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO lottery_entries (username, shares) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET shares = shares + excluded.shares',
      [username, shares],
      (e: Error | null) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        console.log(`Lottery entry added for ${username}: +${shares} shares`);
        resolve();
      }
    );
  });
}

export async function getLotteryTax(): Promise<number> {
  return new Promise((resolve, reject) => {
    db.all('SELECT amount FROM lottery_tax WHERE id = 1', (e: Error | null, result: any[]) => {
      if (e) {
        console.warn('database error', e);
        reject(e);
        return;
      }
      resolve((result.at(0) as { amount: number })?.amount ?? 0);
    });
  });
}

export async function addLotteryTax(amount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO lottery_tax (id, amount) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET amount = amount + excluded.amount',
      [amount],
      (e: Error | null) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        console.log(`Lottery tax added: +${amount}`);
        resolve();
      }
    );
  });
}

export async function clearLottery(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM lottery_entries', (e: Error | null) => {
        if (e) {
          console.warn('database error', e);
          reject(e);
          return;
        }
        db.run('UPDATE lottery_tax SET amount = 0 WHERE id = 1', (e2: Error | null) => {
          if (e2) {
            console.warn('database error', e2);
            reject(e2);
            return;
          }
          console.log('Lottery cleared.');
          resolve();
        });
      });
    });
  });
}
