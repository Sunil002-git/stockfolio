import React, { useEffect, useState } from "react";
import API from "../services/api";

const Trades = () => {
    const [trades, setTrades] = useState([]);

    useEffect(() => {
        fetchTrades();
    }, []);

    const fetchTrades = async () => {
        const res = await API.get("/trades/");
        setTrades(res.data);
    };

    return (
        <div>
            <h2>Trades</h2>
            {trades.map((t) => {
                <div key={t.id}>
                    <p>{t.symbol} - {t.profit_loss}</p>
                </div>
            })}
        </div>
    );
};

export default Trades;