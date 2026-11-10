import { runSourceContract } from './contract.js';
import { createFakeSource } from '../../src/sources/fake/index.js';

runSourceContract('fake', () => createFakeSource());
