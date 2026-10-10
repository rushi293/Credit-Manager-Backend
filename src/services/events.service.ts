import { Response } from 'express';

const clients = new Map<string, Response[]>();

export const addClient = (businessId: string, res: Response) => {
  if (!clients.has(businessId)) {
    clients.set(businessId, []);
  }
  clients.get(businessId)!.push(res);
};

export const removeClient = (businessId: string, res: Response) => {
  const businessClients = clients.get(businessId);
  if (businessClients) {
    const index = businessClients.indexOf(res);
    if (index !== -1) {
      businessClients.splice(index, 1);
    }
    if (businessClients.length === 0) {
      clients.delete(businessId);
    }
  }
};

export const broadcastEvent = (businessId: string, type: string, payload: any = {}) => {
  const businessClients = clients.get(businessId);
  if (businessClients) {
    const dataString = JSON.stringify({ type, ...payload });
    businessClients.forEach((client) => {
      try {
        client.write(`data: ${dataString}\n\n`);
      } catch (err) {
        console.error('Error writing to SSE client:', err);
      }
    });
  }
};

// Keep-alive heartbeat every 30 seconds
setInterval(() => {
  clients.forEach((businessClients) => {
    businessClients.forEach((client) => {
      try {
        client.write(`: heartbeat\n\n`);
      } catch (err) {
        // ignore
      }
    });
  });
}, 30000);