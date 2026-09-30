import { Router } from 'express';
import { getCustomers, createCustomer, getCustomerById, updateCustomer, deleteCustomer } from '../controllers/customer.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', getCustomers);
router.post('/', createCustomer);
router.get('/:id', getCustomerById);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;
