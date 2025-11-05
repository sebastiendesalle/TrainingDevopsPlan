import { useState, useEffect } from 'react';
import './App.css'; // The default CSS file

// 1. --- Define a Type for our Activity ---
interface Activity {
  id: number;
  type: string;
  start_time: string;
  distance_km: number;
}

function App() {
  // 2. --- Create State ---
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 3. --- Fetch Data on Page Load (with plain fetch) ---
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);

        // Call our API endpoint using native fetch
        const response = await fetch('/api/activities');

        // fetch doesn't throw on 404/500, so we check for it
        if (!response.ok) {
          throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        // Parse the JSON data
        const data: Activity[] = await response.json();
        
        setActivities(data); // Save the data
      } catch (err) {
        console.error("Error fetching activities:", err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      } finally {
        setLoading(false); // Stop the loading spinner
      }
    };

    fetchActivities();
  }, []); // The empty array [] means "run this only once"

  // 4. --- Render the Page ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>My Garmin Training Log</h1>
        
        {loading && <p>Loading activities...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}

        {!loading && !error && (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Distance (km)</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity.id}>
                  <td>{new Date(activity.start_time).toLocaleDateString()}</td>
                  <td>{activity.type}</td>
                  <td>{activity.distance_km}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </header>
    </div>
  );
}

export default App;