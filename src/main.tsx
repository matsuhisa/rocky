import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { WordDetail } from "./pages/WordDetail.tsx";
import { WordList } from "./pages/WordList.tsx";
import { WordNew } from "./pages/WordNew.tsx";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WordList />} />
        <Route path="/new" element={<WordNew />} />
        <Route path="/words/:word" element={<WordDetail />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
