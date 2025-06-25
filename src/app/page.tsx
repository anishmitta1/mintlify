"use client";

import axios from "axios";
import axiosRetry from "axios-retry";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const MAX_FILES = 30;
const BASE_URL = "https://mintlify-take-home.com";

const ICON_SIZE = 16;

// API client information
const bearerToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFuaXNobWl0dGE1OTNAZ21haWwuY29tIiwiYXNzZXNzbWVudCI6ImZ1bGxfc3RhY2siLCJjcmVhdGVkX2F0IjoiMjAyNS0wNi0yNVQxNDoxNDoxNy44NzExMjc1MzlaIiwiaWF0IjoxNzUwODYwODU3fQ.Eb7wHcWHcHKthQkaozsenU14MdTIkdOsRcohc71L8dA";

const axiosClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "X-API-Key": bearerToken,
  },
});

axiosRetry(axiosClient, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
});

// Types and Interfaces
type File = {
  metadata: {
    checksum: string;
    created_at: Date;
    size: number;
  };
  path: string;
};

type FileNode = {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
  original?: File; // reference to the original object
};

interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (file: File) => void;
  onCloseClick: () => void;
}

interface FileNodeProps {
  node: FileNode;
  onFileClick: (file: File) => void;
  onCloseClick: () => void;
}

interface FilePreviewProps {
  file: File | null;
  hiddenKey: string;
  closePreview: () => void;
}

// Utility functions
const deduplicateFiles = (files: File[]) =>
  files.filter(
    (file, index, self) => index === self.findIndex((t) => t.path === file.path)
  );

const sortFiles = (files: File[]) =>
  files.sort((a, b) => a.path.localeCompare(b.path));

const validateFile = (file: File): boolean =>
  !!file.metadata.checksum && !!file.path;

const fetchFiles = async (files: File[]): Promise<File> => {
  const response = await axiosClient.post("/api/file", {
    received_files: files,
  });

  return response.data;
};

const buildFileTree = (files: File[]): FileNode[] => {
  const root: FileNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;
    let fullPath = "";

    parts.forEach((part, index) => {
      fullPath += (fullPath ? "/" : "") + part;
      const existing = currentLevel.find((node) => node.name === part);

      if (existing) {
        if (existing.type === "folder") {
          currentLevel = existing.children!;
        }
      } else {
        const isFile = index === parts.length - 1;
        const newNode: FileNode = {
          name: part,
          type: isFile ? "file" : "folder",
          path: fullPath,
          ...(isFile ? { original: file } : { children: [] }),
        };

        currentLevel.push(newNode);
        if (!isFile) currentLevel = newNode.children!;
      }
    });
  }

  return root;
};

// Hooks
const useFiles = () => {
  const [files, setFiles] = useState<File[]>([]);

  const accumulateFiles = async (files: File[]) => {
    const file = await fetchFiles(files);

    if (validateFile(file)) {
      setFiles((files) => deduplicateFiles([...files, file]));
    } else {
      // Invalid file, retry
      accumulateFiles(files);
    }
  };

  useEffect(() => {
    if (files.length < MAX_FILES) {
      accumulateFiles(files);
    }
  }, [files]);

  return files.length === MAX_FILES ? sortFiles(files) : [];
};

const useImage = (file: File | null, hiddenKey: string) => {
  const [image, setImage] = useState<string | null>(null);

  const getImage = async (file: File, hiddenKey: string) => {
    const cdnResponse = await axiosClient.get(`/api/cdn?path=${file.path}`, {
      headers: {
        "X-Hidden-Key": hiddenKey,
      },
    });

    const imageResponse = await axios.get(cdnResponse.data);

    setImage(`data:image/png;base64,${imageResponse.data}`);
  };

  useEffect(() => {
    if (!file || !hiddenKey) {
      setImage(null);
      return;
    }

    getImage(file, hiddenKey);
  }, [file, hiddenKey]);

  return image;
};

// Components
const FileTree = ({ nodes, onFileClick, onCloseClick }: FileTreeProps) => {
  return (
    <ul style={{ listStyle: "none", paddingLeft: 16 }}>
      {nodes.map((node, idx) => (
        <FileNode
          key={idx}
          node={node}
          onFileClick={onFileClick}
          onCloseClick={onCloseClick}
        />
      ))}
    </ul>
  );
};

const FileNode = ({ node, onFileClick, onCloseClick }: FileNodeProps) => {
  const [open, setOpen] = useState(false);

  const Icon = open ? ChevronDown : ChevronRight;

  if (node.type === "folder") {
    return (
      <li>
        <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
          <div className="flex items-center hover:bg-gray-700 rounded-md">
            <Icon size={ICON_SIZE} />
            <div>📁 {node.name}</div>
          </div>
        </div>
        {open && node.children && (
          <FileTree
            nodes={node.children}
            onFileClick={onFileClick}
            onCloseClick={onCloseClick}
          />
        )}
      </li>
    );
  }

  return (
    <li>
      <div
        className="hover:bg-gray-700 rounded-md"
        onClick={() => onFileClick(node.original!)}
        style={{ paddingLeft: ICON_SIZE, cursor: "pointer" }}
      >
        📄 {node.name}
      </div>
    </li>
  );
};

const FilePreview = ({ file, hiddenKey, closePreview }: FilePreviewProps) => {
  const image = useImage(file, hiddenKey);

  if (!file) {
    return (
      <div className="flex flex-1 justify-center items-center">
        Select a file to preview
      </div>
    );
  }

  if (!image) {
    return (
      <div className="flex flex-1 justify-center items-center">
        Loading image...
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      <div className="p-2 flex items-center justify-between border-b border-gray-600">
        <div>{file.path}</div>
        <button onClick={closePreview}>Close</button>
      </div>
      <div className="flex flex-1 justify-center items-center">
        <img
          src={image}
          alt={file.path}
          style={{ objectFit: "contain", width: "30vw" }}
        />
      </div>
    </div>
  );
};

// Main component
export default function Home() {
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const files = useFiles();

  // Got this information from the /api/hint endpoint
  const hiddenKey = files.map((file) => file.path[1]).join("");

  const fileTree = buildFileTree(files);

  const onFileClick = (path: File) => setActiveFile(path);

  const onCloseClick = () => setActiveFile(null);

  if (!files.length) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-16 px-32">
      <div
        className="flex rounded-lg border border-gray-600"
        style={{ height: "80vh" }}
      >
        <div
          className="px-4 border-r border-gray-600"
          style={{ overflowY: "auto", flex: 1 }}
        >
          <FileTree
            nodes={fileTree}
            onFileClick={onFileClick}
            onCloseClick={onCloseClick}
          />
        </div>
        <div className="flex" style={{ flex: 3 }}>
          <FilePreview
            file={activeFile}
            hiddenKey={hiddenKey}
            closePreview={onCloseClick}
          />
        </div>
      </div>
    </div>
  );
}
