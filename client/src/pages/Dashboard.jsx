import Dashboard from '../components/Dashboard.jsx';

// Route-level wrapper. The existing Dashboard component stays inline-styled
// against the old theme; it renders under the new shell unchanged for now.
export default function DashboardPage({ companies }) {
  return <Dashboard companies={companies} />;
}
