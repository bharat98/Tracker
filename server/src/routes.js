import { Router } from 'express';
import * as db from './db.js';

export const routes = Router();

routes.get('/health', (req, res) => {
  res.json({ persistenceMode: 'sqlite', dbPath: db.dbPath() });
});

routes.get('/companies', (req, res) => {
  res.json(db.listCompanies());
});

routes.get('/companies/:id', (req, res) => {
  const c = db.getCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

routes.post('/companies', (req, res) => {
  const created = db.createCompany(req.body || {});
  res.status(201).json(created);
});

routes.put('/companies/:id', (req, res) => {
  const updated = db.updateCompany(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

routes.delete('/companies/:id', (req, res) => {
  db.deleteCompany(req.params.id);
  res.status(204).end();
});

routes.post('/companies/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  db.reorderCompanies(orderedIds);
  res.status(204).end();
});

routes.get('/tweaks', (req, res) => {
  res.json(db.getTweaks());
});

routes.put('/tweaks', (req, res) => {
  db.setTweaks(req.body || {});
  res.status(204).end();
});
