import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/apiError";

interface DeleteUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: any;
}

export default function DeleteUserDialog({ isOpen, onClose, onSuccess, user }: DeleteUserDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const response = await fetch(`http://10.0.0.25:3002/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "");
      }

      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the user account for 
            <span className="font-bold text-gray-900"> {user?.name}</span> and remove their data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-red-600 hover:bg-red-700"
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete User"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
