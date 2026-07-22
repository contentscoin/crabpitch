import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth 콜백/토큰 라우트 등록
auth.addHttpRoutes(http);

export default http;
