import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Import Shadcn components
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Badge } from './components/ui/badge';
import { Alert, AlertDescription } from './components/ui/alert';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { useToast } from './hooks/use-toast';
import { Toaster } from './components/ui/toaster';

// Import icons
import { Upload, FileText, BarChart3, Download, Trash2, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// Import charts
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Dropzone for file upload
import { useDropzone } from 'react-dropzone';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to extract error message from API response
const getErrorMessage = (error) => {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    // If detail is an array (validation errors), extract messages
    if (Array.isArray(detail)) {
      return detail.map(err => err.msg || err.message || 'Validation error').join(', ');
    }
    // If detail is a string, return it directly
    if (typeof detail === 'string') {
      return detail;
    }
  }
  return 'An error occurred';
};

// File Upload Component
const FileUploadZone = ({ onFileUpload, recordType, isUploading }) => {
  const { toast } = useToast();
  
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      toast({
        title: "Invalid file type",
        description: "Please upload Excel (.xlsx, .xls) or CSV (.csv) files only.",
        variant: "destructive",
      });
      return;
    }
    
    await onFileUpload(file, recordType);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} disabled={isUploading} />
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      {isUploading ? (
        <p className="text-gray-600">Uploading...</p>
      ) : isDragActive ? (
        <p className="text-blue-600">Drop the file here...</p>
      ) : (
        <div>
          <p className="text-gray-600 mb-2">
            Drag & drop your {recordType} file here, or click to select
          </p>
          <p className="text-sm text-gray-500">
            Supports Excel (.xlsx, .xls) and CSV (.csv) files
          </p>
        </div>
      )}
    </div>
  );
};

// Manual Entry Form Component
const ManualEntryForm = ({ recordType, onSubmit }) => {
  const [formData, setFormData] = useState({
    gstin: '',
    invoice_number: '',
    invoice_date: '',
    invoice_amount: '',
    cgst: '',
    sgst: '',
    igst: '',
    vendor_name: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      invoice_amount: parseFloat(formData.invoice_amount) || 0,
      cgst: parseFloat(formData.cgst) || 0,
      sgst: parseFloat(formData.sgst) || 0,
      igst: parseFloat(formData.igst) || 0,
    });
    setFormData({
      gstin: '',
      invoice_number: '',
      invoice_date: '',
      invoice_amount: '',
      cgst: '',
      sgst: '',
      igst: '',
      vendor_name: ''
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gstin">GSTIN *</Label>
          <Input
            id="gstin"
            value={formData.gstin}
            onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
            placeholder="Enter GSTIN"
            required
          />
        </div>
        <div>
          <Label htmlFor="invoice_number">Invoice Number *</Label>
          <Input
            id="invoice_number"
            value={formData.invoice_number}
            onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
            placeholder="Enter invoice number"
            required
          />
        </div>
        <div>
          <Label htmlFor="invoice_date">Invoice Date *</Label>
          <Input
            id="invoice_date"
            type="date"
            value={formData.invoice_date}
            onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="invoice_amount">Invoice Amount *</Label>
          <Input
            id="invoice_amount"
            type="number"
            step="0.01"
            value={formData.invoice_amount}
            onChange={(e) => setFormData({ ...formData, invoice_amount: e.target.value })}
            placeholder="Enter amount"
            required
          />
        </div>
        <div>
          <Label htmlFor="cgst">CGST</Label>
          <Input
            id="cgst"
            type="number"
            step="0.01"
            value={formData.cgst}
            onChange={(e) => setFormData({ ...formData, cgst: e.target.value })}
            placeholder="Enter CGST amount"
          />
        </div>
        <div>
          <Label htmlFor="sgst">SGST</Label>
          <Input
            id="sgst"
            type="number"
            step="0.01"
            value={formData.sgst}
            onChange={(e) => setFormData({ ...formData, sgst: e.target.value })}
            placeholder="Enter SGST amount"
          />
        </div>
        <div>
          <Label htmlFor="igst">IGST</Label>
          <Input
            id="igst"
            type="number"
            step="0.01"
            value={formData.igst}
            onChange={(e) => setFormData({ ...formData, igst: e.target.value })}
            placeholder="Enter IGST amount"
          />
        </div>
        <div>
          <Label htmlFor="vendor_name">Vendor Name</Label>
          <Input
            id="vendor_name"
            value={formData.vendor_name}
            onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
            placeholder="Enter vendor name"
          />
        </div>
      </div>
      <Button type="submit" className="w-full">
        Add {recordType} Record
      </Button>
    </form>
  );
};

// Data Display Component
const DataTable = ({ data, title, recordType }) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{data.length} records</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GSTIN</TableHead>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>CGST</TableHead>
                <TableHead>SGST</TableHead>
                <TableHead>IGST</TableHead>
                <TableHead>Total Tax</TableHead>
                {recordType === 'BOOKS' && <TableHead>Vendor</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 10).map((record, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{record.gstin}</TableCell>
                  <TableCell>{record.invoice_number}</TableCell>
                  <TableCell>{record.invoice_date}</TableCell>
                  <TableCell>₹{(record.invoice_amount || 0).toLocaleString()}</TableCell>
                  <TableCell>₹{(record.cgst || 0).toFixed(2)}</TableCell>
                  <TableCell>₹{(record.sgst || 0).toFixed(2)}</TableCell>
                  <TableCell>₹{(record.igst || 0).toFixed(2)}</TableCell>
                  <TableCell>₹{(record.total_tax || 0).toFixed(2)}</TableCell>
                  {recordType === 'BOOKS' && <TableCell>{record.vendor_name || '-'}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.length > 10 && (
            <p className="text-sm text-gray-500 text-center mt-4">
              Showing first 10 of {data.length} records
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Reconciliation Results Component
const ReconciliationResults = ({ summary, matches }) => {
  const { toast } = useToast();

  const getStatusColor = (status) => {
    switch (status) {
      case 'MATCHED': return 'bg-green-100 text-green-800';
      case 'AMOUNT_MISMATCH': return 'bg-orange-100 text-orange-800';
      case 'TAX_MISMATCH': return 'bg-yellow-100 text-yellow-800';
      case 'UNMATCHED_BOOKS': return 'bg-red-100 text-red-800';
      case 'UNMATCHED_2B': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'MATCHED': return <CheckCircle className="h-4 w-4" />;
      case 'AMOUNT_MISMATCH':
      case 'TAX_MISMATCH': return <AlertTriangle className="h-4 w-4" />;
      default: return <XCircle className="h-4 w-4" />;
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get(`${API}/reconciliation/export`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gst_reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      toast({
        title: "Export successful",
        description: "Reconciliation results have been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  if (!summary) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-500">No reconciliation data available. Please perform reconciliation first.</p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const statusData = [
    { name: 'Matched', value: summary.matched_records, color: '#22c55e' },
    { name: 'Amount Mismatch', value: summary.amount_mismatches, color: '#f97316' },
    { name: 'Tax Mismatch', value: summary.tax_mismatches, color: '#eab308' },
    { name: 'Unmatched Books', value: summary.unmatched_books_records, color: '#ef4444' },
    { name: 'Unmatched 2B', value: summary.unmatched_2b_records, color: '#8b5cf6' }
  ];

  const summaryStats = [
    { title: 'Total Books Records', value: summary.total_books_records, icon: FileText },
    { title: 'Total 2B Records', value: summary.total_2b_records, icon: FileText },
    { title: 'Matched Records', value: summary.matched_records, icon: CheckCircle },
    { title: 'Total Mismatches', value: summary.amount_mismatches + summary.tax_mismatches + summary.unmatched_books_records + summary.unmatched_2b_records, icon: XCircle }
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold">{(stat.value || 0).toLocaleString()}</p>
                </div>
                <stat.icon className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Total Amount Difference</span>
                  <span className="text-lg font-bold text-red-600">
                    ₹{(summary.total_amount_difference || 0).toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={Math.min(((summary.total_amount_difference || 0) / 1000000) * 100, 100)} 
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Total Tax Difference</span>
                  <span className="text-lg font-bold text-orange-600">
                    ₹{(summary.total_tax_difference || 0).toLocaleString()}
                  </span>
                </div>
                <Progress 
                  value={Math.min(((summary.total_tax_difference || 0) / 100000) * 100, 100)} 
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
          <Download className="h-4 w-4 mr-2" />
          Export Results
        </Button>
      </div>

      {/* Detailed Matches Table */}
      {matches && matches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Reconciliation Results</CardTitle>
            <CardDescription>Showing first 20 matches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Amount Diff</TableHead>
                    <TableHead>Tax Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.slice(0, 20).map((match, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge className={getStatusColor(match.match_status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(match.match_status)}
                            {match.match_status.replace('_', ' ')}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{match.gstin}</TableCell>
                      <TableCell>{match.invoice_number}</TableCell>
                      <TableCell className={(match.invoice_amount_diff || 0) !== 0 ? 'text-red-600 font-medium' : ''}>
                        ₹{(match.invoice_amount_diff || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={(match.total_tax_diff || 0) !== 0 ? 'text-orange-600 font-medium' : ''}>
                        ₹{(match.total_tax_diff || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Main App Component
function App() {
  const [booksData, setBooksData] = useState([]);
  const [twobData, setTwobData] = useState([]);
  const [reconciliationSummary, setReconciliationSummary] = useState(null);
  const [reconciliationMatches, setReconciliationMatches] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [booksResponse, twobResponse] = await Promise.all([
        axios.get(`${API}/records/BOOKS`),
        axios.get(`${API}/records/2B`)
      ]);
      
      setBooksData(booksResponse.data);
      setTwobData(twobResponse.data);
      
      // Load reconciliation data if available
      try {
        const summaryResponse = await axios.get(`${API}/reconciliation/summary`);
        setReconciliationSummary(summaryResponse.data);
        
        const matchesResponse = await axios.get(`${API}/reconciliation/matches`);
        setReconciliationMatches(matchesResponse.data);
      } catch (error) {
        // Reconciliation data may not exist yet
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleFileUpload = async (file, recordType) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/${recordType}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast({
        title: "Upload successful",
        description: response.data.message,
      });

      await loadData();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualEntry = async (data, recordType) => {
    try {
      await axios.post(`${API}/records/${recordType}`, data);
      
      toast({
        title: "Record added",
        description: `${recordType} record added successfully`,
      });

      await loadData();
    } catch (error) {
      toast({
        title: "Failed to add record",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleReconciliation = async () => {
    if (booksData.length === 0 || twobData.length === 0) {
      toast({
        title: "Insufficient data",
        description: "Please upload both Books and 2B data before reconciliation",
        variant: "destructive",
      });
      return;
    }

    setIsReconciling(true);
    try {
      await axios.post(`${API}/reconcile`);
      
      toast({
        title: "Reconciliation completed",
        description: "GST reconciliation has been completed successfully",
      });

      await loadData();
      setActiveTab('results');
    } catch (error) {
      toast({
        title: "Reconciliation failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleClearData = async (recordType) => {
    try {
      await axios.delete(`${API}/records/${recordType}`);
      
      toast({
        title: "Data cleared",
        description: `${recordType} data cleared successfully`,
      });

      await loadData();
      if (recordType === 'ALL') {
        setReconciliationSummary(null);
        setReconciliationMatches([]);
      }
    } catch (error) {
      toast({
        title: "Failed to clear data",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">GST Reconciliation</h1>
          <p className="text-lg text-gray-600">Reconcile 2B versus Books data with detailed analysis</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{booksData.length}</p>
              <p className="text-sm text-gray-600">Books Records</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{twobData.length}</p>
              <p className="text-sm text-gray-600">2B Records</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <BarChart3 className="h-8 w-8 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{(reconciliationSummary?.matched_records || 0).toString()}</p>
              <p className="text-sm text-gray-600">Matched Records</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">Data Upload</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="view">View Data</TabsTrigger>
            <TabsTrigger value="results">Reconciliation</TabsTrigger>
          </TabsList>

          {/* Data Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload Books Data</CardTitle>
                  <CardDescription>
                    Upload your books/accounting system data in Excel or CSV format
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUploadZone 
                    onFileUpload={handleFileUpload} 
                    recordType="BOOKS" 
                    isUploading={isUploading}
                  />
                  {booksData.length > 0 && (
                    <div className="mt-4 flex justify-between items-center">
                      <Badge variant="secondary">{booksData.length} records loaded</Badge>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleClearData('BOOKS')}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Upload 2B Data</CardTitle>
                  <CardDescription>
                    Upload your GSTR-2B data in Excel or CSV format
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUploadZone 
                    onFileUpload={handleFileUpload} 
                    recordType="2B" 
                    isUploading={isUploading}
                  />
                  {twobData.length > 0 && (
                    <div className="mt-4 flex justify-between items-center">
                      <Badge variant="secondary">{twobData.length} records loaded</Badge>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleClearData('2B')}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>File Format Requirements:</strong> Your Excel/CSV files should contain columns for 
                GSTIN, Invoice Number, Invoice Date, Invoice Amount, CGST, SGST, IGST. 
                Column names are case-insensitive and variations are supported.
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* Manual Entry Tab */}
          <TabsContent value="manual" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Add Books Record</CardTitle>
                  <CardDescription>Manually enter books/accounting data</CardDescription>
                </CardHeader>
                <CardContent>
                  <ManualEntryForm 
                    recordType="BOOKS" 
                    onSubmit={(data) => handleManualEntry(data, 'BOOKS')} 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add 2B Record</CardTitle>
                  <CardDescription>Manually enter GSTR-2B data</CardDescription>
                </CardHeader>
                <CardContent>
                  <ManualEntryForm 
                    recordType="2B" 
                    onSubmit={(data) => handleManualEntry(data, '2B')} 
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* View Data Tab */}
          <TabsContent value="view" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Current Data</h2>
              <Button 
                variant="outline"
                onClick={() => handleClearData('ALL')}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Data
              </Button>
            </div>
            
            <div className="space-y-6">
              <DataTable data={booksData} title="Books Data" recordType="BOOKS" />
              <DataTable data={twobData} title="2B Data" recordType="2B" />
            </div>
          </TabsContent>

          {/* Reconciliation Results Tab */}
          <TabsContent value="results" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Reconciliation Results</h2>
              <Button 
                onClick={handleReconciliation}
                disabled={isReconciling || booksData.length === 0 || twobData.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isReconciling ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Reconciling...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Reconciliation
                  </>
                )}
              </Button>
            </div>
            
            <ReconciliationResults 
              summary={reconciliationSummary} 
              matches={reconciliationMatches} 
            />
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </div>
  );
}

export default App;