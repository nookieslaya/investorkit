import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from '@tanstack/react-router';
import { App } from './screens/app';
import './styles.css';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });
const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: () => <main className="p-8"><h1>Nie znaleziono strony</h1><a href="/">Wróć do portfela</a></main> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: App });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<React.StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></React.StrictMode>);
