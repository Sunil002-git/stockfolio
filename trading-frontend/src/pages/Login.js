import React, {useState} from "react";
import API from "../services/api";

const Login = ({ navigate }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async () => {
        try {
            const res = await API.post("login/", {
                username,
                password,
            });

            localStorage.setItem("token", res.data.access);
            window.location.href = "/dashboard";
        } catch(error) {
            alert("Login Failed: ", error)
        }
    };

    return (
        <>
        <div>
            <h2>Login</h2>
            <input placeholder="Username" onChange={(e) => setUsername(e.target.value)}/>
            <input placeholder="Password" type="password" onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleLogin}>Login</button>
        </div>
        </>
    );
};

export default Login;