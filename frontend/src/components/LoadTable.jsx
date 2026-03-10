import { useState } from "react";
import API_URL from "../config";

function LoadTable({ onLoaded }) {
  const [table, setTable] = useState("");

  const loadTable = async () => {
    const res = await fetch(`${API_URL}/load-table/${table}`);
    const data = await res.json();

    if (data.message) {
      onLoaded(data);
    } else {
      alert(data.error);
    }
  };

  return (
    <div>
      <input
        placeholder="Enter table name"
        value={table}
        onChange={(e) => setTable(e.target.value)}
      />
      <button onClick={loadTable}>Load Table</button>
    </div>
  );
}

export default LoadTable;
