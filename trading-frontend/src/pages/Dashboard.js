import React, {useEffect, useState} from "react";
import API from "../services/api";

const Dashboard = () => {
    const [data, setData] = useState({});

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const res = await API.get("dashboard/");
            setData(res.data);
        } catch (err) {
            console.log(err);
        }
    };

    return(
        <div>
            <h2>Dashboard</h2>
            <p>Balance : {data.balance}</p>
            <p>Total Profit: {data.total_profit}</p>
            <p>Total Trades: {data.total_trades}</p>
        </div>
    );
};

export default Dashboard;