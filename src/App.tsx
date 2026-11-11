/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types';
import { storage } from './services/storage';
import { LoginPage } from './components/auth/LoginPage';
import { Header } from './components/common/Header';
import { OfflineBanner } from './components/common/OfflineBanner';
import { OwnerDashboard } from './components/owner/OwnerDashboard';
import { TeacherDashboard } from './components/teacher/TeacherDashboard';
import { ParentDashboard } from './components/parent/ParentDashboard';

export default function App() {
  const [, setSyncTick] = useState(0);

  // Initialize sample seed data once on first mount and start Firestore cloud sync
  useEffect(() => {
    storage.initializeSeedData();
    const unsubscribe = storage.startCloudSync();
    const handleSync = () => setSyncTick(t => t + 1);
    window.addEventListener('nps_cloud_sync', handleSync);
    return () => {
      unsubscribe();
      window.removeEventListener('nps_cloud_sync', handleSync);
    };
  }, []);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    storage.initializeSeedData();
    return storage.getCurrentUser();
  });
  const [isAdminSession, setIsAdminSession] = useState<boolean>(() => {
    const u = storage.getCurrentUser();
    return u?.role === 'owner' || localStorage.getItem('nps_admin_session') === 'true';
  });

  const [selectedStudentForAttendance, setSelectedStudentForAttendance] = useState<string | undefined>(undefined);

  const handleLoginSuccess = (user: User) => {
    storage.setCurrentUser(user);
    setCurrentUser(user);
    const isAdmin = user.role === 'owner';
    setIsAdminSession(isAdmin);
    if (isAdmin) {
      localStorage.setItem('nps_admin_session', 'true');
    } else {
      localStorage.removeItem('nps_admin_session');
    }
  };

  const handleLogout = () => {
    storage.setCurrentUser(null);
    setCurrentUser(null);
    setIsAdminSession(false);
    localStorage.removeItem('nps_admin_session');
  };

  const handleUserUpdated = (updated: User) => {
    setCurrentUser(updated);
  };

  const handleSwitchUser = (newUser: User) => {
    storage.setCurrentUser(newUser);
    setCurrentUser(newUser);
  };

  const handleNavigateToStudentAttendance = (studentId: string) => {
    setSelectedStudentForAttendance(studentId);
  };

  // If not logged in, show unified single login page (AUTH-01)
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col font-['Cairo',sans-serif] text-right" dir="rtl">
      {/* Offline Status & Background Sync Banner (SW-05, ATT-15) */}
      <OfflineBanner />

      {/* Unified Top Header with School Logo, User Role Badge, and Notification Bell */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onUserUpdated={handleUserUpdated}
        onNavigateToStudentAttendance={handleNavigateToStudentAttendance}
        onSwitchUser={isAdminSession ? handleSwitchUser : undefined}
      />

      {/* Main Role-Specific View (GEN-04 & Section 2.1) */}
      <main className="flex-1 pb-16">
        {currentUser.role === 'owner' && (
          <OwnerDashboard currentUser={currentUser} />
        )}

        {currentUser.role === 'teacher' && (
          <TeacherDashboard currentUser={currentUser} />
        )}

        {currentUser.role === 'parent' && (
          <ParentDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            selectedStudentId={selectedStudentForAttendance}
          />
        )}
      </main>
    </div>
  );
}
