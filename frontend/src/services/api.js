import axios from "axios";

export default axios.create({
  baseURL: "https://apsi-server-backend.onrender.com", // your backend server
});
