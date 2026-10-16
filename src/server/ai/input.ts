import { parseBounded, type Parsed } from '../http';
import { analysisSchema, preferenceSchema, type AnalysisInput } from './context';

// Bound chunked bodies too, before parsing. The route owns authentication;
// this module owns the external request contract and its resource limit.
export const parseAnalysis = (request: Request): Promise<Parsed<AnalysisInput>> => parseBounded(request, analysisSchema, 128_000);
export const parsePreference = (request: Request) => parseBounded(request, preferenceSchema, 4096);
