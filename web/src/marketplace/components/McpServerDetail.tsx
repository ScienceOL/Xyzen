/**
 * MCP Server Detail Page
 * Bohrium MCP 服务器详情页面
 */

import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import {
  ArrowLeftIcon,
  InformationCircleIcon,
  RocketLaunchIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { useBohriumAppDetail, useMcpActivation } from "../hooks/useBohriumMcp";
import McpActivationProgress from "./McpActivationProgress";

interface McpServerDetailProps {
  appKey: string;
  onBack?: () => void;
}

const McpServerDetail: React.FC<McpServerDetailProps> = ({
  appKey,
  onBack,
}) => {
  const { detail, loading, error } = useBohriumAppDetail(appKey);
  const { progress, activateMcp, reset } = useMcpActivation();
  const { addMcpServer, mcpServers } = useXyzen();

  const [isActivating, setIsActivating] = useState(false);
  const [isStarred, setIsStarred] = useState(false);

  // 检查是否已添加
  const isAlreadyAdded = mcpServers.some((server) =>
    server.name.includes(detail?.title || ""),
  );

  // 检查是否已收藏
  useEffect(() => {
    if (detail) {
      const starred = localStorage.getItem(`bohrium_starred_${detail.appKey}`);
      setIsStarred(starred === "true");
    }
  }, [detail]);

  const handleStar = () => {
    if (!detail) return;

    const newStarred = !isStarred;
    setIsStarred(newStarred);
    localStorage.setItem(
      `bohrium_starred_${detail.appKey}`,
      newStarred.toString(),
    );

    // TODO: 可以添加到服务器端持久化
  };

  const handleActivate = async () => {
    if (!detail) return;

    setIsActivating(true);
    try {
      const result = await activateMcp(appKey);

      // 激活成功后，添加到 MCP 服务器列表
      await addMcpServer({
        name: result.detail.title,
        description: result.detail.description || result.detail.descriptionCn,
        url: result.endpoint.url,
        token: result.endpoint.token,
      });

      console.log("MCP 服务器已添加成功！");
    } catch (err) {
      console.error("激活失败:", err);
    }
  };

  const handleClose = () => {
    reset();
    setIsActivating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            加载中...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-8">
        <p className="text-neutral-500 dark:text-neutral-400">未找到应用</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            返回
          </button>
        )}
      </div>

      {/* 左右布局容器 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧主要内容 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cover Image */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-sm"
          >
            <img
              src={detail.cover}
              alt={detail.title}
              className="h-64 w-full object-cover"
            />
          </motion.div>

          {/* Title and Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
                  {detail.title}
                </h1>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  {detail.description || detail.descriptionCn}
                </p>

                {/* Tags */}
                {detail.tags && detail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {detail.tags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={
                          tag.theme === "blue"
                            ? "blue"
                            : tag.theme === "green"
                              ? "green"
                              : tag.theme === "red"
                                ? "red"
                                : "default"
                        }
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleStar}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isStarred
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {isStarred ? (
                    <StarIconSolid className="h-5 w-5" />
                  ) : (
                    <StarIcon className="h-5 w-5" />
                  )}
                  {isStarred ? "已收藏" : "收藏"}
                </button>

                {!isAlreadyAdded ? (
                  <button
                    onClick={handleActivate}
                    disabled={isActivating}
                    className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RocketLaunchIcon className="h-5 w-5" />
                    {isActivating ? "激活中..." : "激活 MCP"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <StarIconSolid className="h-5 w-5" />
                    已添加
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Activation Progress */}
          {isActivating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <McpActivationProgress
                progress={progress}
                onRetry={handleActivate}
                onClose={handleClose}
              />
            </motion.div>
          )}

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-3 gap-4"
          >
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                订阅数
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                {detail.subscribeNum}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                访问次数
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                {detail.accessNum}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                机器类型
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                {detail.machineType}
              </p>
            </div>
          </motion.div>

          {/* Authors */}
          {detail.authors && detail.authors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <InformationCircleIcon className="h-5 w-5" />
                作者信息
              </h2>
              <div className="flex flex-wrap gap-4">
                {detail.authors.map((author) => (
                  <div key={author.userId} className="flex items-center gap-3">
                    {author.avatarUrl ? (
                      <img
                        src={author.avatarUrl}
                        alt={author.userName}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">
                        {author.userName}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {author.email}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* 右侧版本历史 */}
        <div className="lg:col-span-1">
          {detail.changeLogs && detail.changeLogs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
                版本历史
              </h2>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {detail.changeLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border-b border-neutral-100 pb-3 last:border-0 dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {log.version}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {new Date(log.createTime).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    {log.changelog && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {log.changelog}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default McpServerDetail;
