import axiosInstance from "./api";
import { AxiosRequestConfig, AxiosError } from "axios";

/**
 * API Response Type
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Network Request Configuration
 */
interface NetworkRequestConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  endpoint: string;
  data?: any;
  isMultipart?: boolean;
  config?: AxiosRequestConfig;
}

/**
 * Generic Network Helper Function
 * Handles all API requests with centralized error handling and header management
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param endpoint - API endpoint path (without baseURL)
 * @param data - Request body (optional)
 * @param isMultipart - Flag to use multipart/form-data (optional)
 * @param requestConfig - Optional Axios request config, such as responseType for binary downloads
 * @returns Promise with response data
 */
export async function Network<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  endpoint: string,
  data?: any,
  isMultipart: boolean = false,
  requestConfig?: AxiosRequestConfig
): Promise<T> {
  try {
    // Prepare request configuration
    const config: AxiosRequestConfig = {
      method,
      url: endpoint,
      ...requestConfig,
    };

    // Set appropriate headers based on content type
    if (isMultipart) {
      // For multipart/form-data, do NOT set Content-Type manually.
      // Axios will auto-set it with the correct boundary when data is FormData.
      config.headers = {
        ...(requestConfig?.headers || {}),
      };
      // Explicitly delete Content-Type so axios generates it with boundary
      delete config.headers["Content-Type"];
    } else {
      // For JSON requests
      config.headers = {
        "Content-Type": "application/json",
        ...(requestConfig?.headers || {}),
      };
    }

    // Add data to request if provided
    if (data) {
      if (method === "GET") {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    // Make the API request
    const response = await axiosInstance.request(config);

    // Return only response data
    return response.data;
  } catch (error) {
    // Handle axios errors
    if (error instanceof AxiosError) {
      // Log error for debugging
      console.error(`API Error [${method} ${endpoint}]:`, {
        status: error.response?.status,
        message: error.response?.data,
        error: error.message,
      });

      // Re-throw error for component-level handling
      throw error.response?.data || error.message;
    }

    // Handle unexpected errors
    console.error("Unexpected error:", error);
    throw error;
  }
}

/**
 * Convenience methods for common HTTP operations
 */

/**
 * GET request
 */
export async function get<T = any>(endpoint: string, params?: any): Promise<T> {
  return Network<T>("GET", endpoint, params);
}

/**
 * POST request
 */
export async function post<T = any>(
  endpoint: string,
  data?: any,
  isMultipart: boolean = false
): Promise<T> {
  return Network<T>("POST", endpoint, data, isMultipart);
}

/**
 * PUT request
 */
export async function put<T = any>(
  endpoint: string,
  data?: any,
  isMultipart: boolean = false
): Promise<T> {
  return Network<T>("PUT", endpoint, data, isMultipart);
}

/**
 * DELETE request
 */
export async function del<T = any>(endpoint: string, data?: any): Promise<T> {
  return Network<T>("DELETE", endpoint, data);
}

/**
 * PATCH request
 */
export async function patch<T = any>(
  endpoint: string,
  data?: any,
  isMultipart: boolean = false
): Promise<T> {
  return Network<T>("PATCH", endpoint, data, isMultipart);
}
