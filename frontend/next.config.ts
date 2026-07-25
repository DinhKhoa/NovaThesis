import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Enables React's <ViewTransition> integration so App Router navigations
     * run through the browser's View Transitions API.
     *
     * Worth noting why this beats animating the page wrapper by hand: the API
     * animates *snapshots* of the old and new pages, not the live DOM. Nothing
     * in the real tree ever carries a transform, so a page transition cannot
     * become the containing block for `position: fixed` children — which is
     * precisely the bug that broke the modal overlay earlier.
     *
     * Without browser support the app renders normally; navigations simply do
     * not animate.
     */
    viewTransition: true,
  },
};

export default nextConfig;
