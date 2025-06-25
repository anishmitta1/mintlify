"use client";

import axios from "axios";
import axiosRetry from "axios-retry";
import { useEffect, useState } from "react";

const MAX_FILES = 30;
const BASE_URL = "https://mintlify-take-home.com";

const bearerToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFuaXNobWl0dGE1OTNAZ21haWwuY29tIiwiYXNzZXNzbWVudCI6ImZ1bGxfc3RhY2siLCJjcmVhdGVkX2F0IjoiMjAyNS0wNi0yNVQxNDoxNDoxNy44NzExMjc1MzlaIiwiaWF0IjoxNzUwODYwODU3fQ.Eb7wHcWHcHKthQkaozsenU14MdTIkdOsRcohc71L8dA";

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

const useFiles = () => {
  const [files, setFiles] = useState<File[]>([]);

  const accumulateFiles = async () => {
    const file = await fetchFiles(files);

    if (validateFile(file)) {
      setFiles((files) => deduplicateFiles([...files, file]));
    } else {
      // Invalid file, retry
      accumulateFiles();
    }
  };

  useEffect(() => {
    if (files.length < MAX_FILES) {
      accumulateFiles();
    }
  }, [files]);

  return files.length === MAX_FILES ? sortFiles(files) : [];
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

  if (node.type === "folder") {
    return (
      <li>
        <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
          📁 {node.name}
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
      <div onClick={() => onFileClick(node.original!)}>📄 {node.name}</div>
    </li>
  );
};

interface FilePreviewProps {
  file: File | null;
  hiddenKey: string;
}

const useImage = (file: File | null, hiddenKey: string) => {
  const [image, setImage] = useState<string | null>(null);

  const getImage = async (file: File) => {
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
      return;
    }

    getImage(file);
  }, [file, hiddenKey]);

  return image;
};

const FilePreview = ({ file, hiddenKey }: FilePreviewProps) => {
  const image = useImage(file, hiddenKey);

  if (!file) {
    return <div>Select a file to preview</div>;
  }

  if (!image) {
    return <div>Loading image...</div>;
  }

  return (
    <div style={{ width: 300, height: 300 }}>
      <img src={image} alt={file.path} />
    </div>
  );
};

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
    <div className="p-16">
      <div className="flex items-center">
        <FileTree
          nodes={fileTree}
          onFileClick={onFileClick}
          onCloseClick={onCloseClick}
        />
        <FilePreview file={activeFile} hiddenKey={hiddenKey} />
      </div>
    </div>
  );
}
