import { useState, useMemo } from "react";
import {
  Edit2,
  Trash2,
  Search,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  Building,
} from "lucide-react";
import { useQuery, useQueryClient } from "react-query";
import toast from "react-hot-toast";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
} from "../lib/firebase";
import { db, createNewUser, ROLES } from "../lib/firebase";
import { motion, useScroll, useTransform } from "framer-motion";

interface User {
  id: string;
  name: string;
  email: string;
  title?: string;
  department?: string;
  location?: string;
  phone?: number;
  gender?: string;
  dob?: number;
  joiningDate?: number;
  status?: string;
  type?: string;
  photo?: string;
}

async function getUsers(): Promise<User[]> {
  const snapshot = await getDocs(collection(db, "employees"));
  const users = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as User[];
  return users;
}

function UserManagement() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStatus, setNewStatus] = useState("active");
  const [editMode, setEditMode] = useState(false);

  // Add state for editing user fields
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  // Scroll animations
  const { scrollY } = useScroll();
  const headerY = useTransform(scrollY, [0, 100], [0, -50]);
  const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.8]);

  const { data: users = [], isLoading } = useQuery("users", getUsers, {
    staleTime: 5 * 60 * 1000,
  });

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.department?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [users, searchTerm]
  );

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "inactive":
        return "bg-red-100 text-red-800 border-red-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getUserInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Handler for Delete
  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, "employees", userId));
      queryClient.invalidateQueries("users");
      toast.success("User deleted successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete user");
    }
  };

  // Handler for Edit (open modal and set fields)
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditMode(true);
    setEditName(user.name || "");
    setEditEmail(user.email || "");
    setEditTitle(user.title || "");
    setEditDepartment(user.department || "");
    setEditLocation(user.location || "");
    setEditPhone(user.phone ? String(user.phone) : "");
    setEditStatus(user.status || "active");
  };

  // Handler for Save Edit
  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, "employees", selectedUser.id), {
        name: editName,
        email: editEmail,
        title: editTitle,
        department: editDepartment,
        location: editLocation,
        phone: editPhone ? Number(editPhone) : undefined,
        status: editStatus,
      });
      setEditMode(false);
      setSelectedUser(null);
      queryClient.invalidateQueries("users");
      toast.success("User updated successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to update user");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-white/20 dark:border-slate-700/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
        style={{ y: headerY, opacity: headerOpacity }}
      >
        <div>
          <motion.h1
            className="text-3xl font-bold text-gray-900 dark:text-white"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            User Management
          </motion.h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Manage and monitor all system users
          </p>
        </div>

        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setShowAddUser(true)}
            className="inline-flex items-center px-6 py-3 font-semibold rounded-xl shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_rgba(255,255,255,0.9)] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.6),-6px_-6px_12px_rgba(255,255,255,0.05)] bg-[#f8f5f2] text-[#d64b4b] dark:bg-[#e0e0e0] dark:text-[#4da6ff] hover:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.8)] dark:hover:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.7),inset_-4px_-4px_8px_rgba(255,255,255,0.1)] transition-all duration-300 transform hover:scale-105"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Add User
          </button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-4 gap-6"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, staggerChildren: 0.1 }}
      >
        {[
          {
            title: "Total Users",
            value: users.length,
            icon: User,
            color: "blue",
            change: "+12%",
          },
          {
            title: "Active Users",
            value: users.filter((u) => u.status?.toLowerCase() === "active")
              .length,
            icon: User,
            color: "green",
            change: "+5%",
          },
          {
            title: "Departments",
            value: new Set(users.map((u) => u.department).filter(Boolean)).size,
            icon: Building,
            color: "purple",
            change: "+2%",
          },
          {
            title: "New This Month",
            value: users.filter((u) => {
              const joiningDate = new Date(u.joiningDate || 0);
              const now = new Date();
              return (
                joiningDate.getMonth() === now.getMonth() &&
                joiningDate.getFullYear() === now.getFullYear()
              );
            }).length,
            icon: Calendar,
            color: "orange",
            change: "+8%",
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 0.6,
              delay: index * 0.1,
              type: "spring",
              stiffness: 100,
            }}
            whileHover={{
              scale: 1.05,
              y: -5,
              transition: { duration: 0.2 },
            }}
            className="relative rounded-2xl transition-all duration-300 overflow-hidden group hover:-translate-y-0.5 bg-[#eff1f6] text-slate-700 shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:bg-slate-800 dark:text-slate-200 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6"
          >
            <div className="flex items-center justify-between">
              <div
                className={`p-3 rounded-xl ${
                  stat.color === "blue"
                    ? "bg-blue-100 text-blue-600"
                    : stat.color === "green"
                    ? "bg-green-100 text-green-600"
                    : stat.color === "purple"
                    ? "bg-purple-100 text-purple-600"
                    : "bg-orange-100 text-orange-600"
                }`}
              >
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {stat.title}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Search and Filters */}
      <motion.div
        className="rounded-2xl bg-[#eff1f6] shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:bg-slate-800 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, type: "spring", stiffness: 80 }}
      >
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, email, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 border border-white/30 dark:border-gray-600/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700/70 dark:text-white bg-white/70 backdrop-blur-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select className="px-4 py-3 border border-white/30 dark:border-gray-600/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700/70 dark:text-white bg-white/70 backdrop-blur-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
              <option value="">All Departments</option>
              <option value="engineering">Engineering</option>
              <option value="marketing">Marketing</option>
              <option value="sales">Sales</option>
            </select>

            <select className="px-4 py-3 border border-white/30 dark:border-gray-600/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700/70 dark:text-white bg-white/70 backdrop-blur-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Users Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, staggerChildren: 0.05 }}
      >
        {filteredUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 0.6,
              delay: index * 0.05,
              type: "spring",
              stiffness: 120,
            }}
            whileHover={{
              scale: 1.03,
              y: -8,
              transition: { duration: 0.3, type: "spring", stiffness: 300 },
            }}
            className="relative rounded-2xl transition-all duration-300 overflow-hidden group hover:-translate-y-0.5 bg-[#eff1f6] text-slate-700 shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:bg-slate-800 dark:text-slate-200 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <motion.div
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {user.photo ? (
                    <img
                      src={user.photo}
                      alt={user.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    getUserInitials(user.name || "U")
                  )}
                </motion.div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {user.name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {user.title || "Employee"}
                  </p>
                </div>
              </div>

              {user.status && (
                <motion.span
                  className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                    user.status
                  )}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                >
                  {user.status}
                </motion.span>
              )}
            </div>

            <div className="space-y-3">
              <motion.div
                className="flex items-center text-sm text-slate-600 dark:text-slate-400"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Mail className="w-4 h-4 mr-2" />
                <span className="truncate">{user.email}</span>
              </motion.div>

              {user.phone && (
                <motion.div
                  className="flex items-center text-sm text-slate-600 dark:text-slate-400"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  <span>{user.phone}</span>
                </motion.div>
              )}

              {user.department && (
                <motion.div
                  className="flex items-center text-sm text-slate-600 dark:text-slate-400"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Building className="w-4 h-4 mr-2" />
                  <span>{user.department}</span>
                </motion.div>
              )}

              {user.location && (
                <motion.div
                  className="flex items-center text-sm text-slate-600 dark:text-slate-400"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>{user.location}</span>
                </motion.div>
              )}

              {user.joiningDate && (
                <motion.div
                  className="flex items-center text-sm text-slate-600 dark:text-slate-400"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 }}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>
                    Joined {new Date(user.joiningDate).toLocaleDateString()}
                  </span>
                </motion.div>
              )}
            </div>

            <motion.div
              className="mt-6 flex space-x-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <motion.button
                onClick={() => handleEditUser(user)}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-white/70 dark:bg-gray-700/70 border border-white/30 dark:border-gray-600/50 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 hover:bg-white/90 dark:hover:bg-gray-600/90 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </motion.button>
              <motion.button
                onClick={() => handleDeleteUser(user.id)}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900/50 dark:to-pink-900/50 border border-red-300/50 dark:border-red-600/50 text-sm font-medium rounded-xl text-red-700 dark:text-red-400 hover:from-red-200 hover:to-pink-200 dark:hover:from-red-800 dark:hover:to-pink-800 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </motion.button>
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {filteredUsers.length === 0 && (
        <motion.div
          className="text-center py-12"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          >
            <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          </motion.div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No users found
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {searchTerm
              ? "Try adjusting your search criteria."
              : "No users have been added yet."}
          </p>
        </motion.div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-3xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] border border-white/20 dark:border-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
          >
            <div className="p-6 border-b border-white/20 dark:border-gray-700/50">
              <div className="flex items-center justify-between">
                <motion.div
                  className="flex items-center space-x-4"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <motion.div
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    {selectedUser.photo ? (
                      <img
                        src={selectedUser.photo}
                        alt={selectedUser.name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      getUserInitials(selectedUser.name || "U")
                    )}
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedUser.name}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedUser.title || "Employee"}
                    </p>
                  </div>
                </motion.div>
                <motion.button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-white/50 dark:hover:bg-gray-700/50 transition-all duration-300"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  ✕
                </motion.button>
              </div>
            </div>

            <motion.div
              className="p-6 space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Contact Information
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <Mail className="w-4 h-4 text-gray-400 mr-3" />
                      <span className="text-gray-900 dark:text-white">
                        {selectedUser.email}
                      </span>
                    </div>
                    {selectedUser.phone && (
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 text-gray-400 mr-3" />
                        <span className="text-gray-900 dark:text-white">
                          {selectedUser.phone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Work Information
                  </h4>
                  <div className="space-y-3">
                    {selectedUser.department && (
                      <div className="flex items-center">
                        <Building className="w-4 h-4 text-gray-400 mr-3" />
                        <span className="text-gray-900 dark:text-white">
                          {selectedUser.department}
                        </span>
                      </div>
                    )}
                    {selectedUser.location && (
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 text-gray-400 mr-3" />
                        <span className="text-gray-900 dark:text-white">
                          {selectedUser.location}
                        </span>
                      </div>
                    )}
                    {selectedUser.joiningDate && (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-3" />
                        <span className="text-gray-900 dark:text-white">
                          Joined{" "}
                          {new Date(
                            selectedUser.joiningDate
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="flex justify-end space-x-3 pt-6 border-t border-white/20 dark:border-gray-700/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <motion.button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 bg-white/70 dark:bg-gray-700/70 border border-white/30 dark:border-gray-600/50 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-white/90 dark:hover:bg-gray-600/90 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Close
                </motion.button>
                <motion.button
                  onClick={() => handleEditUser(selectedUser)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all duration-300 shadow-[0_4px_8px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_12px_rgba(0,0,0,0.3)] transform hover:scale-105"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Edit User
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Add New User
                </h2>
                <button
                  onClick={() => setShowAddUser(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Software Engineer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Department
                  </label>
                  <input
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Engineering"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Location
                  </label>
                  <input
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Remote"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Phone
                  </label>
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. +1 555 123 4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowAddUser(false)}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newName.trim() || !newEmail.trim()) {
                      toast.error("Name and Email are required");
                      return;
                    }
                    try {
                      // Create Firebase Auth user with default password
                      const defaultPassword = "Enkonix@123";
                      const adminEmails = ["hr@enkonix.in", "ceo@enkonix.in"];
                      const userRole = adminEmails.includes(newEmail.toLowerCase())
                        ? ROLES.HR
                        : ROLES.MEMBER;

                      await createNewUser({
                        email: newEmail,
                        password: defaultPassword,
                        fullName: newName,
                        role: userRole,
                        department: newDepartment as any,
                        permissions: [],
                      });

                      // Also add to employees collection for display
                      await addDoc(collection(db, "employees"), {
                        name: newName,
                        email: newEmail,
                        title: newTitle,
                        department: newDepartment,
                        location: newLocation,
                        phone: newPhone ? Number(newPhone) : undefined,
                        status: newStatus,
                        createdAt: new Date(),
                      });

                      setShowAddUser(false);
                      setNewName("");
                      setNewEmail("");
                      setNewTitle("");
                      setNewDepartment("");
                      setNewLocation("");
                      setNewPhone("");
                      setNewStatus("active");
                      queryClient.invalidateQueries("users");
                      toast.success(
                        `User added successfully! Default password: ${defaultPassword}`
                      );
                    } catch (e: any) {
                      console.error(e);
                      toast.error(e.message || "Failed to add user");
                    }
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
                >
                  Add User
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Edit User Modal */}
      {editMode && selectedUser && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Edit User
              </h2>
              <button
                onClick={() => {
                  setEditMode(false);
                  setSelectedUser(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Department
                  </label>
                  <input
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Location
                  </label>
                  <input
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Phone
                  </label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setEditMode(false);
                    setSelectedUser(null);
                  }}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default UserManagement;
