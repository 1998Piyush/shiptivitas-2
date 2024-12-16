import express from 'express';
import sqlite3 from 'sqlite3';  // Use sqlite3 instead of better-sqlite3
import cors from 'cors';

import 'regenerator-runtime/runtime';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize SQLite3 database
const db = new sqlite3.Database('./clients.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  }
});

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Id can only be integer.',
      },
    };
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM clients WHERE id = ?', [id], (err, client) => {
      if (err) {
        reject(err);
      }
      if (!client) {
        resolve({
          valid: false,
          messageObj: {
            'message': 'Invalid id provided.',
            'long_message': 'Cannot find client with that id.',
          },
        });
      } else {
        resolve({ valid: true });
      }
    });
  });
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (isNaN(priority) || priority <= 0) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid priority provided.',
        'long_message': 'Priority must be a positive integer.',
      },
    };
  }
  return { valid: true };
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  let query = 'SELECT * FROM clients';
  const params = [];

  if (status) {
    if (status !== 'backlog' && status !== 'inProgress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    query += ' WHERE status = ?';
    params.push(status);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).send({ 'message': 'Database error', 'error': err });
    }
    return res.status(200).send(rows);
  });
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = await validateId(id);
  if (!valid) {
    return res.status(400).send(messageObj);
  }

  db.get('SELECT * FROM clients WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).send({ 'message': 'Database error', 'error': err });
    }
    return res.status(200).send(row);
  });
});

/**
 * Update client information based on the parameters provided.
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 */
app.put('/api/v1/clients/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { valid, messageObj } = await validateId(id);
  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;

  if (status && !['backlog', 'inProgress', 'complete'].includes(status)) {
    return res.status(400).send({
      'message': 'Invalid status provided.',
      'long_message': 'Status must be one of: [backlog | inProgress | complete].',
    });
  }

  if (priority) {
    const { valid: priorityValid, messageObj: priorityMessage } = validatePriority(priority);
    if (!priorityValid) {
      return res.status(400).send(priorityMessage);
    }

    // Update the priority of other clients
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Remove other clients with the same status and priority
      db.run('UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ?',
        [status, priority],
        (err) => {
          if (err) {
            return res.status(500).send({ 'message': 'Database error', 'error': err });
          }
        });
      
      db.run('UPDATE clients SET status = ?, priority = ? WHERE id = ?',
        [status, priority, id],
        (err) => {
          if (err) {
            return res.status(500).send({ 'message': 'Database error', 'error': err });
          }
        });

      db.run('COMMIT');
    });
  } else if (status) {
    db.run('UPDATE clients SET status = ? WHERE id = ?', [status, id], (err) => {
      if (err) {
        return res.status(500).send({ 'message': 'Database error', 'error': err });
      }
    });
  }

  // Return the updated list of clients
  db.all('SELECT * FROM clients', (err, rows) => {
    if (err) {
      return res.status(500).send({ 'message': 'Database error', 'error': err });
    }
    return res.status(200).send(rows);
  });
});

app.listen(3001, () => {
  console.log('App running on port 3001');
});

