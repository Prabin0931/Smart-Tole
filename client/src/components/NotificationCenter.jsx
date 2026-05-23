/*
 * Project note: Notification Center is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../services/notificationApi";
import { formatNepalDateTime } from "../utils/dateTime";

function NotificationCenter({ authUser, onUnreadCountChange }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"
  );
  const panelRef = useRef(null);

  const notificationTarget = useMemo(() => {
    if (!authUser?.role) {
      return null;
    }

    if (authUser.role === "resident") {
      return {
        role: "resident",
        userId: authUser.id
      };
    }

    return {
      role: "admin",
      adminId: authUser.id
    };
  }, [authUser]);

  const seenStorageKey = useMemo(() => {
    if (!notificationTarget) {
      return "";
    }

    return `smart-tole-seen-notifications:${notificationTarget.role}:${notificationTarget.userId || notificationTarget.adminId}`;
  }, [notificationTarget]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!notificationTarget && typeof onUnreadCountChange === "function") {
      onUnreadCountChange(0);
    }
  }, [notificationTarget, onUnreadCountChange]);

  useEffect(() => {
    if (typeof onUnreadCountChange === "function") {
      onUnreadCountChange(unreadCount);
    }
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    if (!notificationTarget) {
      return undefined;
    }

    let isActive = true;

    async function loadNotifications() {
      try {
        const data = await getNotifications({
          ...notificationTarget,
          limit: 12
        });

        if (!isActive) {
          return;
        }

        setItems(data.items || []);
        setUnreadCount(data.unreadCount || 0);

        if (!("Notification" in window) || Notification.permission !== "granted" || !seenStorageKey) {
          return;
        }

        const seenIds = new Set(JSON.parse(localStorage.getItem(seenStorageKey) || "[]"));
        const freshItems = (data.items || []).filter((item) => !seenIds.has(item.id));

        if (freshItems.length > 0) {
          const nextSeenIds = new Set(seenIds);

          freshItems.slice(0, 3).forEach((item) => {
            const notification = new Notification(item.title, {
              body: item.message,
              tag: `smart-tole-${item.id}`
            });

            notification.onclick = () => {
              window.focus();
              if (item.linkPath) {
                navigate(item.linkPath);
              }
            };

            nextSeenIds.add(item.id);
          });

          localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(nextSeenIds)));
        }
      } catch (error) {
        console.error("Failed to load notifications:", error.message);
      }
    }

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 15000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [navigate, notificationTarget, seenStorageKey]);

  async function handleAllowBrowserAlerts() {
    if (!("Notification" in window)) {
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
  }

  async function handleOpenNotification(item) {
    try {
      if (!item.isRead) {
        await markNotificationRead(item.id);
        setItems((currentItems) =>
          currentItems.map((currentItem) =>
            currentItem.id === item.id ? { ...currentItem, isRead: true } : currentItem
          )
        );
        setUnreadCount((currentCount) => Math.max(0, currentCount - 1));
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error.message);
    }

    setIsOpen(false);

    if (item.linkPath) {
      navigate(item.linkPath);
    }
  }

  async function handleMarkAllRead() {
    if (!notificationTarget) {
      return;
    }

    try {
      await markAllNotificationsRead(notificationTarget);
      setItems((currentItems) => currentItems.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error.message);
    }
  }

  if (!notificationTarget) {
    return null;
  }

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className={`notification-trigger ${unreadCount > 0 ? "notification-trigger-active" : ""}`}
        onClick={() => setIsOpen((currentState) => !currentState)}
        aria-label="Open notifications"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <div>
              <strong>Notifications</strong>
              <small>{unreadCount} unread</small>
            </div>
            <button type="button" className="notification-text-button" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          </div>

          {permission !== "granted" && "Notification" in window ? (
            <div className="notification-permission">
              <p>Enable browser alerts for instant updates.</p>
              <button type="button" className="button button-secondary" onClick={handleAllowBrowserAlerts}>
                Allow Alerts
              </button>
            </div>
          ) : null}

          <div className="notification-list">
            {items.length === 0 ? (
              <div className="notification-empty">
                <strong>No notifications yet</strong>
                <p>New complaint, notice, and dustbin updates will appear here.</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`notification-item ${item.isRead ? "notification-item-read" : ""}`}
                  onClick={() => handleOpenNotification(item)}
                >
                  <div className="notification-item-top">
                    <strong>{item.title}</strong>
                    {!item.isRead ? <span className="notification-item-dot" /> : null}
                  </div>
                  <p>{item.message}</p>
                  <small>{formatNepalDateTime(item.createdAt)}</small>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NotificationCenter;
