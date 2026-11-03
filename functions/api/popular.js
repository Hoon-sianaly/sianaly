import catalog from '../../data/company-index.json';
import {createPopularHandler} from '../../scripts/popular-handler.mjs';

export const onRequest=createPopularHandler(catalog.companies.map(c=>c.key));
