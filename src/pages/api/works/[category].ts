/**
 * Public API — Get works by category for grid display
 * GET /api/works/{category} - Get all works for a category
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { getWorksForGrid, type WorkCategory } from '@lib/db/queries';

const validCategories: WorkCategory[] = ['audio', 'physical', 'digital', 'collaborations'];

export const GET: APIRoute = async ({ params }) => {
  const { category } = params;

  // Validate category
  if (!category || !validCategories.includes(category as WorkCategory)) {
    return new Response(
      JSON.stringify({ error: 'Invalid category' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const works = await getWorksForGrid(category as WorkCategory);

    return new Response(
      JSON.stringify({ works }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Disable caching to ensure fresh data
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Get works error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch works', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
