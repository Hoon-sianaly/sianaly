import catalog from '../../../data/company-index.json';
import {createAccountHandler} from '../../../scripts/account-handler.mjs';

export const onRequest=createAccountHandler({companyKeys:catalog.companies.map(c=>c.key)});
