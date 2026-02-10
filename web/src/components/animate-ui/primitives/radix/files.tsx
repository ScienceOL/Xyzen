"use client";

import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  type AccordionContentProps,
  type AccordionItemProps,
  type AccordionProps,
  type AccordionTriggerProps,
} from "@/components/animate-ui/primitives/radix/accordion";

type FilesProps = AccordionProps;

function Files(props: FilesProps) {
  return <Accordion data-slot="files" {...props} />;
}

type FolderItemProps = AccordionItemProps;

function FolderItem(props: FolderItemProps) {
  return <AccordionItem data-slot="folder-item" {...props} />;
}

type FolderTriggerProps = AccordionTriggerProps;

function FolderTrigger(props: FolderTriggerProps) {
  return (
    <AccordionHeader data-slot="folder-header">
      <AccordionTrigger data-slot="folder-trigger" {...props} />
    </AccordionHeader>
  );
}

type FolderContentProps = AccordionContentProps;

function FolderContent(props: FolderContentProps) {
  return <AccordionContent data-slot="folder-content" {...props} />;
}

type FileItemProps = React.HTMLAttributes<HTMLDivElement>;

function FileItem(props: FileItemProps) {
  return <div data-slot="file-item" role="treeitem" {...props} />;
}

export {
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
  FileItem,
  type FileItemProps,
  type FilesProps,
  type FolderContentProps,
  type FolderItemProps,
  type FolderTriggerProps,
};
